// tests/pdf-report.test.js
// Tests for the pdf-report parsing layer: operator-list walker, grid parser,
// due-date rules and full-name splitting.  Ingestion and the plugin wrapper are
// covered in pdf-report-service.test.js.
//
// The fixture is an anonymised dump of a real report's text items (names
// replaced) — the confidential PDF itself is never stored in the repo.

// walkOperatorList is pure; pdfjs-dist itself (ESM-only) is never loaded here.
const { walkOperatorList } = require('../services/plugins/pdf/pdf-text');
const { parseGrid, deriveDueDate } = require('../services/plugins/pdf/grid-parser');
const { parseFullName } = require('../services/plugins/name-parser');

const fixture = require('./fixtures/pdf-report/six-month-report.items.json');

// ── Synthetic report builder ────────────────────────────────────────────────

const HEADER_X = [101, 229.7, 315.1, 392.3, 470.8, 549.5, 627.4, 705];   // label start per column
const CELL_X = [44.5, 209.4, 287.4, 365.4, 443.5, 521.6, 599.8, 677.9];  // cell text start per column
const BLACK = '#000000';
const ORANGE = '#ff9900';

const item = (x, y, text, { bold = false, color = BLACK } = {}) => ({ x, y, text, bold, color });

/**
 * rows: { category } | { skill: string | string[], names: { [columnLabel]: Array<string | { name, orange, lines }> } }
 */
function makePage(page, { months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'], created = '5/10/2026', rows = [], header = true }) {
    const labels = ['Skill Name', 'Lapsed', ...months];
    const items = [];
    if (header) labels.forEach((l, i) => items.push(item(HEADER_X[i], 144, l, { bold: true })));
    let y = 160;
    for (const row of rows) {
        if (row.category) {
            items.push(item(CELL_X[0], y, row.category, { bold: true }));
            y += 16;
            continue;
        }
        const skillLines = [].concat(row.skill || []);
        skillLines.forEach((line, i) => items.push(item(CELL_X[0], y + i * 9.7, line)));
        let height = 15;
        for (const [label, names] of Object.entries(row.names || {})) {
            const col = labels.indexOf(label);
            let ny = y;
            for (const n of names) {
                const entry = typeof n === 'string' ? { name: n } : n;
                const lines = entry.lines || [entry.name];
                const color = entry.color || (entry.orange ? ORANGE : BLACK);
                lines.forEach((line, i) => items.push(item(CELL_X[col], ny + i * 9.7, line, { color })));
                ny += 15 + (lines.length - 1) * 9.7;
            }
            height = Math.max(height, ny - y);
        }
        y += height + 1;
    }
    if (created !== null) {
        items.push(item(61.4, 540.9, 'Created:', { bold: true, color: '#ffffff' }));
        if (created) items.push(item(96.1, 540.9, created, { bold: true, color: '#ffffff' }));
    }
    return { page, items };
}

const byKey = (records) => Object.fromEntries(records.map((r) => [`${r.sourceName}|${r.skill}`, r]));

// ── walkOperatorList ────────────────────────────────────────────────────────

describe('walkOperatorList', () => {
    const OPS = {
        save: 1, restore: 2, transform: 3, setFillRGBColor: 4, setFont: 5, beginText: 6, endText: 7,
        setTextMatrix: 8, moveText: 9, setLeading: 10, setLeadingMoveText: 11, nextLine: 12,
        showText: 13, showSpacedText: 14, nextLineShowText: 15, nextLineSetSpacingShowText: 16,
    };
    const glyphs = (s) => [...s].map((c) => ({ unicode: c }));
    const fonts = { F1: 'ABCDEF+Tahoma', F2: 'ABCDEF+Tahoma-Bold' };
    const view = [0, 0, 792, 612];
    const walk = (ops) => walkOperatorList(
        { fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) },
        OPS, (id) => fonts[id], view,
    );

    it('converts text positions to top-down page coordinates through the CTM', () => {
        const runs = walk([
            [OPS.transform, [1, 0, 0, 1, 10, 20]],
            [OPS.beginText, []],
            [OPS.setFont, ['F1', 11]],
            [OPS.moveText, [100, 500]],
            [OPS.showText, [glyphs('Andrew Keith')]],
            [OPS.endText, []],
        ]);
        expect(runs).toEqual([{ x: 110, y: 92, text: 'Andrew Keith', bold: false, color: '#000000' }]);
    });

    it('records fill colour and bold fonts, and restores colour on restore', () => {
        const runs = walk([
            [OPS.save, []],
            [OPS.setFillRGBColor, ['#FF9900']],
            [OPS.beginText, []],
            [OPS.setFont, ['F1', 11]],
            [OPS.moveText, [50, 100]],
            [OPS.showText, [glyphs('Orange')]],
            [OPS.endText, []],
            [OPS.restore, []],
            [OPS.beginText, []],
            [OPS.setFont, ['F2', 11]],
            [OPS.moveText, [50, 80]],
            [OPS.showText, [glyphs('Header')]],
            [OPS.endText, []],
        ]);
        expect(runs[0]).toMatchObject({ text: 'Orange', color: '#ff9900', bold: false });
        expect(runs[1]).toMatchObject({ text: 'Header', color: '#000000', bold: true, y: 532 });
    });

    it('appends runs shown without repositioning and turns wide TJ gaps into spaces', () => {
        const runs = walk([
            [OPS.beginText, []],
            [OPS.setTextMatrix, [1, 0, 0, 1, 40, 300]],
            [OPS.showText, [glyphs('Hazmat')]],
            [OPS.showSpacedText, [[...glyphs('-'), -300, ...glyphs('Decon'), -20, ...glyphs('tamination')]]],
            [OPS.endText, []],
        ]);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({ x: 40, y: 312, text: 'Hazmat- Decontamination' });
    });

    it('handles leading-based line moves and drops whitespace-only runs', () => {
        const runs = walk([
            [OPS.beginText, []],
            [OPS.setTextMatrix, [1, 0, 0, 1, 40, 300]],
            [OPS.setLeading, [12]],
            [OPS.showText, [glyphs('Line one')]],
            [OPS.nextLine, []],
            [OPS.showText, [glyphs('   ')]],
            [OPS.nextLineShowText, [glyphs('Line three')]],
            [OPS.setLeadingMoveText, [0, -10]],
            [OPS.showText, [glyphs('Line four')]],
            [OPS.endText, []],
        ]);
        expect(runs.map((r) => [r.text, r.y])).toEqual([
            ['Line one', 312], ['Line three', 336], ['Line four', 346],
        ]);
    });
});

// ── parseGrid — real (anonymised) report ────────────────────────────────────

describe('parseGrid — anonymised real report fixture', () => {
    const result = parseGrid(fixture.pages);
    const records = byKey(result.records);

    it('reads the header and Created date', () => {
        expect(result.createdDate).toBe('2026-10-05');
        expect(result.columns).toEqual(['Skill Name', 'Lapsed', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']);
        expect(result.warnings).toEqual([]);
    });

    it('extracts every member × skill entry across all 12 pages', () => {
        expect(result.records).toHaveLength(249);
        expect(new Set(result.records.map((r) => r.skill)).size).toBe(32);
        expect(new Set(result.records.map((r) => r.sourceName)).size).toBe(15);
        expect(result.records.filter((r) => r.sourceName === 'Obi-Wan Kenobi')).toHaveLength(15);
    });

    it('merges wrapped skill names and wrapped member names', () => {
        const skills = new Set(result.records.map((r) => r.skill));
        expect(skills).toContain('BA - Breathing Apparatus Skills and Emergencies (C)');
        expect(skills).toContain('OI (H6-2) - Portable gas cylinders and pressurised vessels');
        expect(records['Jyn Erso|BA - Breathing Apparatus Skills and Emergencies (C)']).toBeDefined();
        expect(result.records.some((r) => r.sourceName === 'Jyn' || r.sourceName === 'Erso')).toBe(false);
    });

    it('keeps the source spelling of skill names (double spaces, en-dashes)', () => {
        const skills = new Set(result.records.map((r) => r.skill));
        expect(skills).toContain('Hazmat - Emergency Decontamination  (C)');
        expect(skills).toContain('Module 1 Working Safely around Water – Level 1');
    });

    it('continues a skill that spans a page break', () => {
        const entry = result.records.filter((r) => r.skill === 'BA - Entry Control Procedures (C)');
        expect(entry).toHaveLength(15);
        expect(new Set(entry.map((r) => r.page))).toEqual(new Set([1, 2]));
    });

    it('takes skill categories from the category bands', () => {
        expect(records['Obi-Wan Kenobi|BA - Search & Rescue'].skillCategory).toBe('B.A');
        expect(records['Luke Skywalker|OI (FL2-1) - Use of FENZ Operational Vehicles'].skillCategory).toBe('Driving');
        expect(records['Obi-Wan Kenobi|IM - Tactical Command Simulation Training (Volunteers)'].skillCategory)
            .toBe('Recertifications - Restricted');
    });

    it('applies the agreed due-date rules', () => {
        // Report month (Oct) — all orange → last day of October
        expect(records['Han Solo|OI (S1) - Multi-Storied buildings']).toMatchObject({
            dueDate: '2026-10-31', dueMonth: '2026-10', withinOneMonth: true, lapsed: false,
        });
        // Next month, orange → 1st
        expect(records['Padme Amidala|Ladders - Rescue - 10.5 Wooden']).toMatchObject({ dueDate: '2026-11-01', withinOneMonth: true });
        // Next month, black → Created day
        expect(records['Luke Skywalker|OI (G7) - Decontamination']).toMatchObject({ dueDate: '2026-11-05', withinOneMonth: false });
        // Later months → 1st, with year rollover into 2027
        expect(records['Obi-Wan Kenobi|BA - Search & Rescue'].dueDate).toBe('2026-12-01');
        expect(records['Obi-Wan Kenobi|Personal protective clothing – Does Your Kit Fit'].dueDate).toBe('2027-01-01');
        expect(records['Obi-Wan Kenobi|Module 3 Water Safety Kit']).toMatchObject({ dueDate: '2027-03-01', dueMonth: '2027-03' });

        const counts = {};
        result.records.forEach((r) => { counts[r.dueDate] = (counts[r.dueDate] || 0) + 1; });
        expect(counts).toEqual({
            '2026-10-31': 8, '2026-11-01': 8, '2026-11-05': 94, '2026-12-01': 29,
            '2027-01-01': 57, '2027-02-01': 26, '2027-03-01': 27,
        });
    });
});

// ── parseGrid — synthetic layouts ───────────────────────────────────────────

describe('parseGrid — synthetic layouts', () => {
    it('rolls the year over and derives each column date', () => {
        const { records, warnings } = parseGrid([makePage(1, {
            months: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'],
            created: '20/11/2026',
            rows: [
                { category: 'Pumps' },
                {
                    skill: 'Pumps - Basic',
                    names: {
                        Lapsed: ['Ann Lee'],
                        Nov: [{ name: 'Bob Day', orange: true }],
                        Dec: ['Cy Fox', { name: 'Di Ng', orange: true }],
                        Jan: ['Ed Po'],
                    },
                },
            ],
        })]);
        const r = byKey(records);
        expect(warnings).toEqual([]);
        expect(r['Ann Lee|Pumps - Basic']).toMatchObject({ dueDate: '2026-10-31', dueMonth: null, lapsed: true });
        expect(r['Bob Day|Pumps - Basic'].dueDate).toBe('2026-11-30');
        expect(r['Cy Fox|Pumps - Basic'].dueDate).toBe('2026-12-20');
        expect(r['Di Ng|Pumps - Basic'].dueDate).toBe('2026-12-01');
        expect(r['Ed Po|Pumps - Basic']).toMatchObject({ dueDate: '2027-01-01', dueMonth: '2027-01', skillCategory: 'Pumps' });
    });

    it('merges wrapped lines and carries skill and category across pages', () => {
        const page1 = makePage(1, {
            rows: [
                { category: 'B.A' },
                { skill: ['BA - Long skill name that', 'wraps (C)'], names: { Dec: [{ name: 'x', lines: ['Matthew', 'Walkinshaw'] }, 'Jo Bo'] } },
            ],
        });
        const page2 = makePage(2, {
            rows: [{ skill: ['BA - Long skill name that', 'wraps (C)'], names: { Dec: ['Al Gee'] } }],
        });
        const { records } = parseGrid([page1, page2]);
        expect(records.map((r) => [r.sourceName, r.skill, r.skillCategory, r.page])).toEqual([
            ['Matthew Walkinshaw', 'BA - Long skill name that wraps (C)', 'B.A', 1],
            ['Jo Bo', 'BA - Long skill name that wraps (C)', 'B.A', 1],
            ['Al Gee', 'BA - Long skill name that wraps (C)', 'B.A', 2],
        ]);
    });

    it('skips pages without text', () => {
        const page = makePage(1, { rows: [{ skill: 'S', names: { Dec: ['Al Gee'] } }] });
        expect(parseGrid([page, { page: 2, items: [] }]).records).toHaveLength(1);
    });

    it('warns about inconsistent highlighting, unexpected colours and duplicates', () => {
        const { records, warnings } = parseGrid([makePage(1, {
            rows: [{
                skill: 'S',
                names: {
                    Oct: ['Al Gee'],                                     // black in report month
                    Jan: [{ name: 'Bo Day', orange: true }, { name: 'Cy Fox', color: '#ff0000' }, 'Cy Fox'],
                },
            }],
        })]);
        expect(records).toHaveLength(3);
        expect(warnings).toHaveLength(4);
        expect(warnings.join('\n')).toMatch(/report month but not highlighted orange/);
        expect(warnings.join('\n')).toMatch(/orange but expires more than a month out/);
        expect(warnings.join('\n')).toMatch(/Unexpected text colour #ff0000/);
        expect(warnings.join('\n')).toMatch(/Duplicate entry for "Cy Fox"/);
    });

    it.each([
        ['no pages', [], /no pages/],
        ['no text at all', [{ page: 1, items: [] }], /no text/],
        ['missing header', [makePage(1, { header: false, rows: [{ skill: 'S', names: { Dec: ['Al Gee'] } }] })], /header row/],
        ['missing Created date', [makePage(1, { created: null, rows: [{ skill: 'S', names: { Dec: ['Al Gee'] } }] })], /Created/],
        ['invalid Created date', [makePage(1, { created: '31/2/2026', rows: [{ skill: 'S', names: { Dec: ['Al Gee'] } }] })], /Created/],
        ['no entries', [makePage(1, { rows: [{ category: 'Pumps' }] })], /No member skill entries/],
        ['non-consecutive months', [makePage(1, { months: ['Oct', 'Nov', 'Jan', 'Feb', 'Mar', 'Apr'], rows: [{ skill: 'S', names: { Nov: ['Al Gee'] } }] })], /not consecutive/],
        ['unknown header column', [makePage(1, { months: ['Oct', 'Nov', 'Total', 'Jan', 'Feb', 'Mar'], rows: [] })], /unexpected header column "Total"/],
        ['name before any skill', [makePage(1, { rows: [{ names: { Dec: ['Al Gee'] } }] })], /appears before any skill/],
        ['header differs between pages', [
            makePage(1, { rows: [{ skill: 'S', names: { Dec: ['Al Gee'] } }] }),
            makePage(2, { months: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'], rows: [] }),
        ], /header columns differ/],
    ])('throws when there is %s', (_label, pages, message) => {
        expect(() => parseGrid(pages)).toThrow(message);
    });
});

// ── deriveDueDate ───────────────────────────────────────────────────────────

describe('deriveDueDate', () => {
    it('puts a January report\'s lapsed entries on 31 December of the previous year', () => {
        expect(deriveDueDate('lapsed', null, { y: 2027, m: 0, d: 15 }, false)).toBe('2026-12-31');
    });

    it('clamps the Created day to the length of the next month', () => {
        expect(deriveDueDate(1, 2027, { y: 2027, m: 0, d: 31 }, false)).toBe('2027-02-28');
    });

    it('handles a December report whose next month is January', () => {
        expect(deriveDueDate(0, 2027, { y: 2026, m: 11, d: 10 }, false)).toBe('2027-01-10');
        expect(deriveDueDate(0, 2027, { y: 2026, m: 11, d: 10 }, true)).toBe('2027-01-01');
        expect(deriveDueDate(11, 2026, { y: 2026, m: 11, d: 10 }, true)).toBe('2026-12-31');
    });
});

// ── parseFullName ───────────────────────────────────────────────────────────

describe('parseFullName', () => {
    it.each([
        ['Andrew Keith', { firstName: 'Andrew', lastName: 'Keith' }],
        ['  Jan van der Merwe ', { firstName: 'Jan', lastName: 'van der Merwe' }],
        ['Madonna', { firstName: '', lastName: 'Madonna' }],
        ['', { firstName: '', lastName: '' }],
        [undefined, { firstName: '', lastName: '' }],
    ])('splits %p', (input, expected) => {
        expect(parseFullName(input)).toEqual(expected);
    });
});
