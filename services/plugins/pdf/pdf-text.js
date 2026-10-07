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
// Some generators (e.g. Chromium) split a word into separate runs at kerning
// pairs ("Darth V" + "ader"). A run starting within this fraction of the font
// size from where the previous one ended, on the same line, continues it;
// a gap wider than SPACE_GAP is a word space.
const JOIN_GAP = 0.3;
const SPACE_GAP = 0.15;

/**
 * Minimal 2D DOMMatrix for Node when @napi-rs/canvas is not installed.
 *
 * pdf.js's Node build polyfills DOMMatrix from the optional native
 * @napi-rs/canvas package and creates one at module load. That package is
 * deliberately left out of the Docker image (its prebuilt binary dies with
 * SIGILL — an uncatchable crash — on the Raspberry Pi's ARM CPU). The server
 * only reads text and drawing commands, never renders, so a plain affine
 * matrix is all pdf.js needs here.
 */
class AffineDOMMatrix {
    constructor(init) {
        const m = init && typeof init.length === 'number' && init.length >= 6 ? init : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(m).slice(0, 6).map(Number);
    }

    multiply(o) {
        return new AffineDOMMatrix([
            this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b,
            this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d,
            this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f,
        ]);
    }

    translate(tx = 0, ty = 0) { return this.multiply(new AffineDOMMatrix([1, 0, 0, 1, tx, ty])); }

    scale(sx = 1, sy = sx) { return this.multiply(new AffineDOMMatrix([sx, 0, 0, sy, 0, 0])); }

    inverse() {
        const det = this.a * this.d - this.b * this.c;
        if (!det) return new AffineDOMMatrix([NaN, NaN, NaN, NaN, NaN, NaN]);
        return new AffineDOMMatrix([
            this.d / det, -this.b / det, -this.c / det, this.a / det,
            (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det,
        ]);
    }
}

function installDomMatrixIfCanvasMissing() {
    if (globalThis.DOMMatrix) return;
    try {
        require.resolve('@napi-rs/canvas');   // locates the package without loading its native code
    } catch {
        globalThis.DOMMatrix = AffineDOMMatrix;
        // Rendering-only classes: placeholders just keep pdf.js from logging
        // "rendering may be broken" — nothing here renders.
        if (!globalThis.Path2D) globalThis.Path2D = class Path2D {};
        if (!globalThis.ImageData) globalThis.ImageData = class ImageData {};
    }
}

let pdfjsPromise = null;
/**
 * Load pdf.js once. A failure here is a server setup problem (e.g. dependencies not
 * installed in the container), not a bad file: the error is flagged `setupError`
 * so callers don't report the PDF as unreadable, and the next call tries again.
 */
function loadPdfjs() {
    if (!pdfjsPromise) {
        installDomMatrixIfCanvasMissing();
        pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').catch((e) => {
            pdfjsPromise = null;
            const err = new Error(
                `The PDF library (pdfjs-dist) could not be loaded on the server — reinstall the dependencies ` +
                `(npm install, or rebuild the Docker image and its node_modules volume). Cause: ${e.message}`,
            );
            err.setupError = true;
            throw err;
        });
    }
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

// Horizontal advance of a run in text space units (glyph widths are 1/1000 em).
function glyphsAdvance(glyphs, fontSize) {
    let thousandths = 0;
    for (const g of glyphs || []) {
        if (typeof g === 'number') thousandths -= g;
        else if (g && typeof g.width === 'number') thousandths += g.width;
    }
    return (thousandths / 1000) * fontSize;
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

    let gs = { ctm: [1, 0, 0, 1, 0, 0], fill: '#000000', font: null, fontSize: 0 };
    const stack = [];
    let tm = [1, 0, 0, 1, 0, 0];       // text matrix
    let lineStart = [0, 0];            // text line matrix origin
    let leading = 0;
    let moved = true;                  // has the text position changed since the last run?
    let lastEnd = null;                // { x, y, em } of the previous run, in page coordinates

    const moveTo = (tx, ty) => {
        lineStart = [lineStart[0] + tx * tm[0] + ty * tm[2], lineStart[1] + tx * tm[1] + ty * tm[3]];
        tm = [tm[0], tm[1], tm[2], tm[3], lineStart[0], lineStart[1]];
        moved = true;
    };

    const emit = (glyphs) => {
        const text = glyphsToText(glyphs);
        if (!text) return;
        const last = runs[runs.length - 1];

        const ux = gs.ctm[0] * tm[4] + gs.ctm[2] * tm[5] + gs.ctm[4];
        const uy = gs.ctm[1] * tm[4] + gs.ctm[3] * tm[5] + gs.ctm[5];
        const x = ux - x0;
        const y = y1 - uy;
        // Page-space scale of the text (unrotated text assumed, as in the report).
        const xScale = Math.abs(tm[0] * gs.ctm[0]) || 1;
        const em = gs.fontSize * (Math.abs(tm[3] * gs.ctm[3]) || 1);
        const endX = x + glyphsAdvance(glyphs, gs.fontSize) * xScale;

        if (last && !moved) {
            // Same text object, no repositioning — this run continues the previous one.
            last.text += text;
            lastEnd = { x: endX, y, em };
            return;
        }
        if (last && lastEnd && em > 0 && Math.abs(y - lastEnd.y) < 0.5) {
            const gap = x - lastEnd.x;
            if (gap > -JOIN_GAP * em && gap < JOIN_GAP * em) {
                // Repositioned only for kerning/spacing — still the same word or phrase.
                last.text += (gap > SPACE_GAP * em && !last.text.endsWith(' ') ? ' ' : '') + text;
                lastEnd = { x: endX, y, em };
                moved = false;
                return;
            }
        }

        const fontName = gs.font ? fontNameOf(gs.font) || '' : '';
        runs.push({
            x: round2(x),
            y: round2(y),
            text,
            bold: /bold|black|heavy/i.test(fontName),
            color: gs.fill,
        });
        lastEnd = { x: endX, y, em };
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
                gs.fontSize = typeof a[1] === 'number' ? a[1] : gs.fontSize;
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
