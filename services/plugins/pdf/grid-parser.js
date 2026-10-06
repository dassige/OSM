// services/plugins/pdf/grid-parser.js
// Parses the positioned text of the FENZ "Skills Expiring in the Next Six Months"
// report into one record per member × skill.  Pure: no I/O, no pdf.js.
//
// Report layout (every page):
//   header row   : Skill Name | Lapsed | <month> × 6           (bold)
//   category row : bold text in the Skill Name column           ("B.A", "Driving" …)
//   skill block  : skill name in column 0, member full names in the month column
//                  the skill expires in — one name per line, long names/skills wrap
//   footer       : "Created: D/M/YYYY" + confidentiality caution
// A skill block that spans a page break repeats its skill name on the next page.
//
// The report has no day and no year, so due dates are derived from the Created
// date (agreed rules — see deriveDueDate()).  Orange names (#ff9900) are members
// whose skill expires within one month of the Created date.

'use strict';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ORANGE = '#ff9900';
const NORMAL_TEXT_COLOURS = new Set(['#000000', ORANGE]);

const ROW_TOLERANCE = 1.0;   // pt — items closer than this vertically sit on the same row
const WRAP_GAP = 12.5;       // pt — wrapped lines are ~9.7pt apart; separate rows are ~15pt
const BODY_MARGIN = 2.0;     // pt — gap kept clear of the header row and the footer

const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const lastDayOf = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

function parseHeader(items, pageNo) {
    const anchor = items.find((i) => i.text === 'Skill Name');
    if (!anchor) throw new Error(`Page ${pageNo}: header row ("Skill Name") not found — not an OSM six-month report?`);
    const cells = items.filter((i) => Math.abs(i.y - anchor.y) < ROW_TOLERANCE).sort((a, b) => a.x - b.x);
    const columns = cells.map((c) => {
        const label = c.text.trim();
        if (label === 'Skill Name') return { label, key: 'skill', x: c.x };
        if (label === 'Lapsed') return { label, key: 'lapsed', x: c.x };
        const month = MONTHS.indexOf(label.slice(0, 3).toLowerCase());
        if (month === -1 || label.length > 9) {
            throw new Error(`Page ${pageNo}: unexpected header column "${label}"`);
        }
        return { label, key: month, x: c.x };
    });
    if (columns[0].key !== 'skill') throw new Error(`Page ${pageNo}: "Skill Name" is not the first column`);
    if (!columns.some((c) => typeof c.key === 'number')) throw new Error(`Page ${pageNo}: no month columns in header`);
    return { y: anchor.y, columns };
}

const CREATED_RE = /^Created:?(?:\s+(\d{1,2}\/\d{1,2}\/\d{4}))?$/;
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

function parseCreated(items) {
    // "Created:" and the date are usually separate text runs, but may be one.
    const label = items.find((i) => CREATED_RE.test(i.text.trim()));
    if (!label) return null;
    const inline = CREATED_RE.exec(label.text.trim())[1];
    const value = inline || items.find((i) => Math.abs(i.y - label.y) < ROW_TOLERANCE && DATE_RE.test(i.text.trim()))?.text.trim();
    if (!value) return { footerY: label.y, date: null };
    const [d, m, y] = value.split('/').map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return { footerY: label.y, date: null };
    return { footerY: label.y, date: { y, m: m - 1, d } };
}

// Column index for an x position: boundaries are the midpoints between header labels.
function columnIndex(columns, x) {
    for (let c = columns.length - 1; c > 0; c--) {
        if (x >= (columns[c - 1].x + columns[c].x) / 2) return c;
    }
    return 0;
}

// Group a page's body items into cells, merging wrapped continuation lines.
function buildCells(items, columns) {
    const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const lastInColumn = new Map();
    const cells = [];
    for (const it of sorted) {
        const col = columnIndex(columns, it.x);
        const prev = lastInColumn.get(col);
        if (prev && it.y - prev.yEnd < WRAP_GAP && !it.bold && !prev.bold && prev.color === it.color) {
            prev.text = `${prev.text.trimEnd()} ${it.text.trimStart()}`;
            prev.yEnd = it.y;
            continue;
        }
        const cell = { col, y: it.y, yEnd: it.y, text: it.text, bold: it.bold, color: it.color };
        cells.push(cell);
        lastInColumn.set(col, cell);
    }
    // Reading order: by row, then left to right (so a skill is seen before its names).
    return cells.sort((a, b) => (Math.abs(a.y - b.y) < ROW_TOLERANCE ? a.col - b.col : a.y - b.y));
}

/**
 * Map each month column to its calendar year, walking forward from the Created
 * date and rolling the year over whenever the month number goes backwards.
 * Also checks the months are consecutive.
 */
function resolveMonthYears(columns, created) {
    const monthCols = columns.filter((c) => typeof c.key === 'number');
    const years = new Map();
    let year = created.y;
    let prev = created.m;
    monthCols.forEach((c, idx) => {
        if (idx > 0 && c.key !== (monthCols[idx - 1].key + 1) % 12) {
            throw new Error(`Month columns are not consecutive (${monthCols.map((m) => m.label).join(', ')})`);
        }
        if (c.key < prev) year++;
        prev = c.key;
        years.set(c.key, year);
    });
    return years;
}

/**
 * Agreed due-date rules (report Created on D/M/Y):
 *   Lapsed column             → last day of the month before the Created month
 *   Created month             → last day of that month (not yet lapsed per the report)
 *   Next month, orange name   → 1st of that month (expires before the Created day)
 *   Next month, black name    → the Created day in that month (earliest possible)
 *   Any later month           → 1st of that month
 */
function deriveDueDate(columnKey, year, created, orange) {
    if (columnKey === 'lapsed') {
        const m = (created.m + 11) % 12;
        const y = created.m === 0 ? created.y - 1 : created.y;
        return isoDate(y, m, lastDayOf(y, m));
    }
    const m = columnKey;
    if (year === created.y && m === created.m) return isoDate(year, m, lastDayOf(year, m));
    const nextM = (created.m + 1) % 12;
    const nextY = created.m === 11 ? created.y + 1 : created.y;
    if (year === nextY && m === nextM && !orange) return isoDate(year, m, Math.min(created.d, lastDayOf(year, m)));
    return isoDate(year, m, 1);
}

/**
 * Parse every page of the report.
 *
 * @param {Array<{ page: number, items: Array<{ x, y, text, bold, color }> }>} pages
 * @returns {{
 *   createdDate: string,
 *   columns: string[],
 *   records: Array<{ sourceName, skill, skillCategory, dueDate, dueMonth, lapsed, withinOneMonth, page }>,
 *   warnings: string[]
 * }}
 * @throws {Error} when the layout is not recognised — never returns partial data silently
 */
function parseGrid(pages) {
    if (!Array.isArray(pages) || pages.length === 0) throw new Error('PDF has no pages');

    let columns = null;
    let created = null;
    let category = null;
    let skill = null;
    const raw = [];
    const warnings = [];

    for (const { page, items } of pages) {
        const texts = (items || []).filter((i) => i.text && i.text.trim());
        if (texts.length === 0) continue;

        const header = parseHeader(texts, page);
        if (!columns) {
            columns = header.columns;
        } else if (header.columns.map((c) => c.label).join('|') !== columns.map((c) => c.label).join('|')) {
            throw new Error(`Page ${page}: header columns differ from page 1`);
        }
        // Column x positions are read per page in case the layout shifts slightly.
        const pageColumns = header.columns;

        const footer = parseCreated(texts);
        if (footer?.date && !created) created = footer.date;
        const footerY = footer ? footer.footerY : Infinity;

        const body = texts.filter((i) => i.y > header.y + BODY_MARGIN && i.y < footerY - BODY_MARGIN);
        for (const cell of buildCells(body, pageColumns)) {
            if (cell.col === 0) {
                if (cell.bold) {
                    category = cell.text.trim();
                    skill = null;
                } else {
                    skill = cell.text.trim();
                }
                continue;
            }
            if (!skill) throw new Error(`Page ${page}: member "${cell.text}" appears before any skill name`);
            if (!NORMAL_TEXT_COLOURS.has(cell.color)) {
                warnings.push(`Unexpected text colour ${cell.color} for "${cell.text}" (${skill}) — treated as normal`);
            }
            raw.push({
                page,
                sourceName: cell.text.replace(/\s+/g, ' ').trim(),
                skill,
                skillCategory: category,
                columnKey: pageColumns[cell.col].key,
                orange: cell.color === ORANGE,
            });
        }
    }

    if (!columns) throw new Error('PDF contains no text — is it a scanned image?');
    if (!created) throw new Error('Report "Created: D/M/YYYY" date not found in the page footer');
    if (raw.length === 0) throw new Error('No member skill entries found in the report');

    const years = resolveMonthYears(columns, created);
    const nextM = (created.m + 1) % 12;
    const seen = new Set();
    const records = [];

    for (const r of raw) {
        const key = `${r.sourceName}\u0000${r.skill}`;
        if (seen.has(key)) {
            warnings.push(`Duplicate entry for "${r.sourceName}" / "${r.skill}" ignored`);
            continue;
        }
        seen.add(key);

        const lapsed = r.columnKey === 'lapsed';
        const year = lapsed ? null : years.get(r.columnKey);
        if (!lapsed) {
            const isCreatedMonth = year === created.y && r.columnKey === created.m;
            if (isCreatedMonth && !r.orange) {
                warnings.push(`"${r.sourceName}" / "${r.skill}" is in the report month but not highlighted orange`);
            }
            if (r.orange && !isCreatedMonth && r.columnKey !== nextM) {
                warnings.push(`"${r.sourceName}" / "${r.skill}" is highlighted orange but expires more than a month out`);
            }
        }

        records.push({
            sourceName: r.sourceName,
            skill: r.skill,
            skillCategory: r.skillCategory,
            dueDate: deriveDueDate(r.columnKey, year, created, r.orange),
            dueMonth: lapsed ? null : `${year}-${pad2(r.columnKey + 1)}`,
            lapsed,
            withinOneMonth: r.orange,
            page: r.page,
        });
    }

    return {
        createdDate: isoDate(created.y, created.m, created.d),
        columns: columns.map((c) => c.label),
        records,
        warnings,
    };
}

module.exports = { parseGrid, deriveDueDate };
