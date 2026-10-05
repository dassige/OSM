// services/plugins/pdf/pdf-text.js
// Turns a PDF buffer into positioned text runs: { x, y, text, bold, color }.
//
// pdf.js's getTextContent() has no colour information, and the OSM report encodes
// meaning in text colour (orange = expires within one month), so this walks the
// page operator list instead and tracks the graphics/text state itself.
//
// Coordinates are PDF points with the origin at the TOP-left of the page
// (y grows downwards), which is the natural reading order for the grid parser.
//
// Security: PDFs reach this code from an email inbox, so pdf.js runs with
// isEvalSupported:false (CVE-2024-4367 class of font-compilation exploits)
// and without font-face loading.  Only this module touches pdfjs-dist — it is
// ESM-only, so it is loaded lazily via dynamic import() and mocked in Jest.

'use strict';

const DEFAULT_MAX_PAGES = 200;
// TJ spacing adjustments are in thousandths of an em; anything wider than a
// quarter em is rendered as a visible gap, so treat it as a word space.
const TJ_SPACE_THRESHOLD = -250;

let pdfjsPromise = null;
function loadPdfjs() {
    if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjsPromise;
}

// Concatenate matrix m onto the current transform ctm (PDF "cm" semantics).
function multiply(ctm, m) {
    return [
        ctm[0] * m[0] + ctm[2] * m[1],
        ctm[1] * m[0] + ctm[3] * m[1],
        ctm[0] * m[2] + ctm[2] * m[3],
        ctm[1] * m[2] + ctm[3] * m[3],
        ctm[0] * m[4] + ctm[2] * m[5] + ctm[4],
        ctm[1] * m[4] + ctm[3] * m[5] + ctm[5],
    ];
}

function glyphsToText(glyphs) {
    let text = '';
    for (const g of glyphs || []) {
        if (typeof g === 'number') {
            if (g <= TJ_SPACE_THRESHOLD) text += ' ';
        } else if (g && typeof g.unicode === 'string') {
            text += g.unicode;
        }
    }
    return text;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Walk one page's operator list and collect text runs.  Pure — no pdf.js import —
 * so it can be unit-tested with a synthetic operator list.
 *
 * @param {{ fnArray: number[], argsArray: any[] }} opList
 * @param {object}   OPS          pdf.js OPS enum (name → opcode)
 * @param {Function} fontNameOf   fontId → PostScript font name (e.g. "ABCDEF+Tahoma-Bold")
 * @param {number[]} view         page.view [x0, y0, x1, y1]
 * @returns {Array<{ x: number, y: number, text: string, bold: boolean, color: string }>}
 */
function walkOperatorList(opList, OPS, fontNameOf, view) {
    const [x0, , , y1] = view;
    const runs = [];

    let gs = { ctm: [1, 0, 0, 1, 0, 0], fill: '#000000', font: null };
    const stack = [];
    let tm = [1, 0, 0, 1, 0, 0];       // text matrix
    let lineStart = [0, 0];            // text line matrix origin
    let leading = 0;
    let moved = true;                  // has the text position changed since the last run?

    const moveTo = (tx, ty) => {
        lineStart = [lineStart[0] + tx * tm[0] + ty * tm[2], lineStart[1] + tx * tm[1] + ty * tm[3]];
        tm = [tm[0], tm[1], tm[2], tm[3], lineStart[0], lineStart[1]];
        moved = true;
    };

    const emit = (glyphs) => {
        const text = glyphsToText(glyphs);
        if (!text) return;
        const last = runs[runs.length - 1];
        if (!moved && last) {
            // Same text object, no repositioning — this run continues the previous one.
            last.text += text;
            return;
        }
        const ux = gs.ctm[0] * tm[4] + gs.ctm[2] * tm[5] + gs.ctm[4];
        const uy = gs.ctm[1] * tm[4] + gs.ctm[3] * tm[5] + gs.ctm[5];
        const fontName = gs.font ? fontNameOf(gs.font) || '' : '';
        runs.push({
            x: round2(ux - x0),
            y: round2(y1 - uy),
            text,
            bold: /bold|black|heavy/i.test(fontName),
            color: gs.fill,
        });
        moved = false;
    };

    const { fnArray, argsArray } = opList;
    for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const a = argsArray[i] || [];
        switch (fn) {
            case OPS.save:
                stack.push({ ...gs, ctm: [...gs.ctm] });
                break;
            case OPS.restore:
                if (stack.length) gs = stack.pop();
                break;
            case OPS.transform:
                gs.ctm = multiply(gs.ctm, a);
                moved = true;
                break;
            case OPS.setFillRGBColor:
                gs.fill = typeof a[0] === 'string' ? a[0].toLowerCase() : gs.fill;
                break;
            case OPS.setFont:
                gs.font = a[0];
                break;
            case OPS.beginText:
                tm = [1, 0, 0, 1, 0, 0];
                lineStart = [0, 0];
                moved = true;
                break;
            case OPS.setTextMatrix: {
                const m = a.length === 6 ? a : Array.from(a[0] || []);
                if (m.length === 6) {
                    tm = [...m];
                    lineStart = [m[4], m[5]];
                    moved = true;
                }
                break;
            }
            case OPS.moveText:
                moveTo(a[0], a[1]);
                break;
            case OPS.setLeading:
                leading = a[0];
                break;
            case OPS.setLeadingMoveText:
                leading = -a[1];
                moveTo(a[0], a[1]);
                break;
            case OPS.nextLine:
                moveTo(0, -leading);
                break;
            case OPS.showText:
            case OPS.showSpacedText:
                emit(a[0]);
                break;
            case OPS.nextLineShowText:
                moveTo(0, -leading);
                emit(a[0]);
                break;
            case OPS.nextLineSetSpacingShowText:
                moveTo(0, -leading);
                emit(a[2]);
                break;
            default:
                break;
        }
    }

    for (const r of runs) r.text = r.text.trim();
    return runs.filter((r) => r.text);
}

/**
 * Extract positioned text runs from every page of a PDF.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {object} [options]
 * @param {number} [options.maxPages=200]  Refuse documents longer than this
 * @returns {Promise<{ pageCount: number, pages: Array<{ page: number, width: number, height: number, items: Array }> }>}
 */
async function extractTextItems(buffer, { maxPages = DEFAULT_MAX_PAGES } = {}) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: pdfjs.VerbosityLevel.ERRORS,
    }).promise;

    try {
        if (doc.numPages > maxPages) {
            throw new Error(`PDF has ${doc.numPages} pages — more than the ${maxPages} page limit.`);
        }
        const pages = [];
        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const opList = await page.getOperatorList();
            const fontNameOf = (id) => {
                try { return page.commonObjs.get(id)?.name; } catch { return undefined; }
            };
            const [vx0, vy0, vx1, vy1] = page.view;
            pages.push({
                page: p,
                width: round2(vx1 - vx0),
                height: round2(vy1 - vy0),
                items: walkOperatorList(opList, pdfjs.OPS, fontNameOf, page.view),
            });
            page.cleanup();
        }
        return { pageCount: doc.numPages, pages };
    } finally {
        await doc.destroy();
    }
}

module.exports = { extractTextItems, walkOperatorList };
