/**
 * Generates a FICTIONAL "Skills Expiring in the Next Six Months" PDF report in
 * the same layout as the FENZ report (skill rows × Lapsed + six month columns,
 * category bands, wrapped names, orange "within one month" names, a
 * "Created: D/M/YYYY" page footer) — so the pdf-report plugin can be
 * demonstrated and tested without the confidential real report.
 *
 * People are the demo database's Star Wars members written as full names;
 * skills are real FENZ skill names. Due months are relative to the Created
 * date, so a report generated today always has current dates.
 *
 * The generated PDF is read back through the plugin's own parser before it is
 * returned, so a layout the parser cannot read fails here, not in a demo.
 *
 * Usage:
 *   npm run sample:skills-report -- [--created YYYY-MM-DD] [--out path.pdf]
 *   node scripts/guide-builder/pdf-report/sample-report.js --created 2026-09-05
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { extractTextItems } = require('../../../services/plugins/pdf/pdf-text');
const { parseGrid } = require('../../../services/plugins/pdf/grid-parser');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Full names of the demo.db members ("QFF Skywalker, L" → "Luke Skywalker"), plus
// "Rey Skywalker", who has no member record (shows the "Not found" case).
const PEOPLE = [
    'Obi-Wan Kenobi', 'Leia Organa', 'Luke Skywalker', 'Han Solo', 'Darth Vader', 'Minch Yoda',
    'Lando Calrissian', 'Poe Dameron', 'Jyn Erso', 'Ahsoka Tano', 'Boba Fett', 'Sheev Palpatine',
    'Mace Windu', 'Rey Skywalker',
];

// Category bands and skills exactly as named in the demo database.
const CATEGORIES = [
    ['B.A', ['BA - Breathing Apparatus Skills and Emergencies (C)', 'BA - Entry Control Procedures (C)']],
    ['Driving', ['Driving - ERD Legislation', 'OI (FL2-1) - Use of FENZ Operational Vehicles']],
    ['First Aid', ['Medical Co-response - CPR (C)']],
    ['Haz Subs', ['Hazmat - Emergency Decontamination  (C)']],
    ['Ladders', ['Ladders - Rescue - 10.5 Wooden']],
    ["Operational Instructions (OI's)", [
        'OI (IS1) - Operational Safety (C)',
        'OI (M1-1) News Media at Incidents',
        'OI (H6-2) - Portable gas cylinders and pressurised vessels',
    ]],
    ['OSH', ['OSH - Safe Person Concept (C)']],
    ['Recertifications', ['Line - Working at Heights Revalidation']],
];

/**
 * Deterministic spread of people over the columns of one skill.
 * col: 'L' (lapsed) or 0..5 (months after the Created month).
 * Orange = expires within a month of the Created date: always in the report
 * month, sometimes in the next month (as in the real report).
 */
function entriesForSkill(skillIndex) {
    const out = [];
    PEOPLE.forEach((person, i) => {
        const h = (i * 7 + skillIndex * 13) % 11;
        if (h > 6) return;                         // not listed for this skill
        if (h === 0 && i % 2 === 1) return;        // keep lapsed entries occasional
        const col = h === 0 ? 'L' : (h - 1) % 6;
        out.push({ person, col, orange: col === 0 || (col === 1 && i % 3 === 0) });
    });
    return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildHtml(created) {
    const monthLabels = Array.from({ length: 6 }, (_, k) => MONTHS[(created.getUTCMonth() + k) % 12]);
    const cols = ['L', 0, 1, 2, 3, 4, 5];
    let skillIndex = 0;
    let rows = '';
    for (const [category, skills] of CATEGORIES) {
        rows += `<tr class="cat"><td colspan="8">${esc(category)}</td></tr>`;
        for (const skill of skills) {
            const entries = entriesForSkill(skillIndex++);
            const byCol = new Map(cols.map((c) => [c, entries.filter((e) => e.col === c)]));
            const height = Math.max(1, ...[...byCol.values()].map((l) => l.length));
            for (let r = 0; r < height; r++) {
                rows += '<tr>';
                if (r === 0) rows += `<td class="skill" rowspan="${height}">${esc(skill)}</td>`;
                for (const c of cols) {
                    const e = byCol.get(c)[r];
                    rows += e ? `<td class="${e.orange ? 'orange' : ''}">${esc(e.person)}</td>` : '<td></td>';
                }
                rows += '</tr>';
            }
        }
    }
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000; margin: 0; }
        .band { background: #1a1060; color: #fff; padding: 10px 16px; margin-bottom: 10px; }
        .band div { font-weight: bold; font-size: 16px; text-decoration: underline; }
        .role { font-weight: bold; font-size: 11px; margin: 0 0 8px 0; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { background: #bcd1e3; font-weight: bold; text-align: center; padding: 4px; border: 1px solid #8aa; }
        th.lapsed { color: #ff0000; }
        th.skillh { width: 26%; }
        td { border: 1px solid #ccc; padding: 5px 6px; vertical-align: top; line-height: 1.2; }
        td.skill { background: #fff; }
        tr.cat td { background: #ffff99; font-weight: bold; }
        td.orange { color: #ff9900; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
    </style></head><body>
        <div class="band"><div>Skills Expiring in the Next Six Months</div><div>Demo Station - Volunteers</div></div>
        <p class="role">This is a fictional sample report generated by OpReady for demonstration and testing.</p>
        <table>
            <thead><tr><th class="skillh">Skill Name</th><th class="lapsed">Lapsed</th>${monthLabels.map((m) => `<th>${m}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </body></html>`;
}

function parseCreated(value) {
    const d = value ? new Date(`${value}T00:00:00Z`) : new Date();
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid --created date "${value}" (use YYYY-MM-DD)`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Write a sample report PDF and check the plugin can read it.
 *
 * @param {object} options
 * @param {string} options.outputPath
 * @param {string} [options.createdDate]  YYYY-MM-DD (default: today)
 * @returns {Promise<{ outputPath: string, createdDate: string, entryCount: number, names: string[] }>}
 */
async function buildSampleReport({ outputPath, createdDate }) {
    const created = parseCreated(createdDate);
    const createdText = `${created.getUTCDate()}/${created.getUTCMonth() + 1}/${created.getUTCFullYear()}`;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.setContent(buildHtml(created), { waitUntil: 'load' });
        await page.pdf({
            path: outputPath,
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '12mm', bottom: '18mm', left: '12mm', right: '12mm' },
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `
                <div style="width:100%; font-family: Arial, sans-serif; font-size:9px; padding:0 12mm; display:flex; justify-content:space-between;">
                    <span><b>Created:</b>&nbsp;&nbsp;&nbsp;<span>${createdText}</span></span>
                    <span>Fictional sample — not a real report</span>
                    <span class="pageNumber"></span>
                </div>`,
        });
    } finally {
        await browser.close();
    }

    // Read it back exactly as the app will.
    const { pages } = await extractTextItems(fs.readFileSync(outputPath));
    const parsed = parseGrid(pages);
    const expected = CATEGORIES.flatMap(([, skills]) => skills).reduce((n, _s, i) => n + entriesForSkill(i).length, 0);
    if (parsed.records.length !== expected) {
        throw new Error(`Sample report self-check failed: wrote ${expected} entries, parser read ${parsed.records.length}`);
    }
    if (parsed.warnings.length) throw new Error(`Sample report self-check warnings: ${parsed.warnings.join('; ')}`);
    const stray = [...new Set(parsed.records.map((r) => r.sourceName))].filter((n) => !PEOPLE.includes(n));
    if (stray.length) throw new Error(`Sample report self-check: names read differently from written: ${stray.join(', ')}`);
    return {
        outputPath,
        createdDate: parsed.createdDate,
        entryCount: parsed.records.length,
        names: [...new Set(parsed.records.map((r) => r.sourceName))],
    };
}

/**
 * Render one page of a PDF to PNG with pdf.js (for figures in the generated documents).
 * Uses the optional @napi-rs/canvas package that pdfjs-dist installs where available.
 */
async function renderPdfPagePng(pdfPath, pngPath, { pageNumber = 1, scale = 1.6 } = {}) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = require('@napi-rs/canvas');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), isEvalSupported: false }).promise;
    try {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
        fs.mkdirSync(path.dirname(pngPath), { recursive: true });
        fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));
        return pngPath;
    } finally {
        await doc.destroy();
    }
}

module.exports = { buildSampleReport, renderPdfPagePng, PEOPLE };

if (require.main === module) {
    const arg = (name) => {
        const i = process.argv.indexOf(name);
        return i !== -1 ? process.argv[i + 1] : undefined;
    };
    const outputPath = path.resolve(arg('--out') || path.join(__dirname, '..', 'output', 'pdf-report', 'Sample-Skills-Report.pdf'));
    buildSampleReport({ outputPath, createdDate: arg('--created') })
        .then((r) => console.log(`[sample:skills-report] Wrote ${r.outputPath} — created ${r.createdDate}, ${r.entryCount} entries, ${r.names.length} people.`))
        .catch((e) => { console.error('[sample:skills-report] FAILED:', e.message); process.exit(1); });
}
