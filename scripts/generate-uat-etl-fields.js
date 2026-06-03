#!/usr/bin/env node
/**
 * generate-uat-etl-fields.js
 *
 * Generates a Word (.docx) UAT testing plan covering all features introduced
 * after UAT-ETL-Plugin-Refactor.docx in the ETL-plugins session:
 *   - Backfill script
 *   - Enhanced Import from OSM (members & skills) with New/Changed diff UI
 *   - Add/Edit modals with ETL fields and lock/unlock matching keys
 *   - FENZ rank authority ordering across all pages
 *
 * Usage:
 *   node scripts/generate-uat-etl-fields.js
 *   npm run generate-uat-etl-fields
 *
 * Output: UAT-ETL-Fields-and-Sync.docx (project root)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, HeadingLevel, WidthType, BorderStyle,
    ShadingType, TableLayoutType,
} = require('docx');

// ── Colours ──────────────────────────────────────────────────────────────────
const TEAL        = '17A2B8';
const TEAL_LIGHT  = 'E8F6F8';
const GREY_HEADER = 'F2F2F2';
const WHITE       = 'FFFFFF';
const PASS_GREEN  = 'D9EAD3';
const DARK_TEXT   = '1A1A1A';

// ── Helpers ───────────────────────────────────────────────────────────────────

function hRule() {
    return new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL } },
        spacing: { after: 120 },
    });
}

function spacer(pts = 120) {
    return new Paragraph({ spacing: { after: pts } });
}

function cell(children, options = {}) {
    return new TableCell({
        children: Array.isArray(children) ? children : [new Paragraph({ children: [children] })],
        shading: options.shade ? { type: ShadingType.CLEAR, fill: options.shade } : undefined,
        width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
    });
}

function bold(text, size = 22, color = DARK_TEXT) {
    return new TextRun({ text, bold: true, size, color });
}

function normal(text, size = 20, color = DARK_TEXT) {
    return new TextRun({ text, size, color });
}

function italic(text, size = 20, color = '555555') {
    return new TextRun({ text, italics: true, size, color });
}

function stepsTable(steps) {
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            cell([new Paragraph({ children: [bold('#', 20, WHITE)] })],    { shade: TEAL, width: 8  }),
            cell([new Paragraph({ children: [bold('Step', 20, WHITE)] })], { shade: TEAL, width: 92 }),
        ],
    });
    const dataRows = steps.map((step, i) =>
        new TableRow({
            children: [
                cell([new Paragraph({ children: [normal(String(i + 1))] })], { shade: i % 2 === 0 ? WHITE : TEAL_LIGHT, width: 8  }),
                cell([new Paragraph({ children: [normal(step)] })],          { shade: i % 2 === 0 ? WHITE : TEAL_LIGHT, width: 92 }),
            ],
        })
    );
    return new Table({
        layout: TableLayoutType.FIXED,
        width:  { size: 100, type: WidthType.PERCENTAGE },
        rows:   [headerRow, ...dataRows],
    });
}

function testCase({ id, title, steps, expected, note }) {
    const elements = [
        new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: `${id} — ${title}`, color: TEAL, bold: true, size: 22 })],
            spacing: { before: 240, after: 80 },
        }),
        new Paragraph({ children: [bold('Steps', 20)], spacing: { after: 60 } }),
        stepsTable(steps),
        spacer(100),
        new Paragraph({ children: [bold('Expected Result', 20)], spacing: { after: 60 } }),
        new Paragraph({ children: [normal(expected)], spacing: { after: note ? 80 : 180 } }),
    ];
    if (note) {
        elements.push(new Paragraph({
            children: [italic(`Note: ${note}`)],
            spacing: { after: 200 },
        }));
    }
    return elements;
}

function sectionHeading(title) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: title, bold: true, size: 28, color: TEAL })],
        spacing: { before: 300, after: 100 },
    });
}

// ── Test cases ────────────────────────────────────────────────────────────────

const TESTS = [
    // ── Backfill script ───────────────────────────────────────────────────────
    {
        section: 'Backfill Script',
        id: 'T1', title: 'Backfill populates ETL fields for existing members',
        steps: [
            'Ensure the server is running via Docker Compose.',
            'In a terminal, run: docker-compose exec opready npm run backfill-etl-fields',
            'Observe the console output.',
        ],
        expected:
            'Every member row that had a NULL member_osm_id is processed. ' +
            'Each line shows: member ID, raw name, parsed rank, last name, and first name. ' +
            'Final line shows the count of updated members and skills. ' +
            'Re-running immediately prints "(nothing to update)" for both sections.',
    },
    {
        section: 'Backfill Script',
        id: 'T2', title: 'Backfill --force re-derives all rows',
        steps: [
            'Run: docker-compose exec opready npm run backfill-etl-fields -- --force',
            'Observe the mode line at the top of the output.',
        ],
        expected:
            'Mode line reads "FORCE — re-deriving all rows (manual field corrections will be overwritten)". ' +
            'Every member and skill row is processed, including those already populated.',
        note:
            '--force will overwrite any rank/first_name/last_name values that were manually set via ' +
            'the edit modal. Use only when re-categorisation from the raw name is intentional.',
    },
    {
        section: 'Backfill Script',
        id: 'T3', title: 'Backfill populates skill_osm_id and skill_category',
        steps: [
            'After running the backfill, open DBeaver or the browser DevTools console.',
            'Inspect any skill row that previously had NULL skill_osm_id.',
        ],
        expected:
            'skill_osm_id equals the skill name exactly (e.g. "OI (IS1) - Operational Safety"). ' +
            'skill_category contains a meaningful category (e.g. "Operational Integrity", "Pumps", "Line Rescue"). ' +
            'Skills with no matching rule show "General" or the prefix before the first " - " separator.',
    },

    // ── Import from OSM — Members ─────────────────────────────────────────────
    {
        section: 'Import from OSM — Members',
        id: 'T4', title: 'Discover modal shows New and Changed sections',
        steps: [
            'Navigate to the Members page.',
            'Click Import from OSM.',
            'Wait for the scan to complete.',
        ],
        expected:
            'The modal header reads "Sync Members from OSM". ' +
            'A "NEW" (green badge) section lists members from OSM not yet in the roster. ' +
            'A "CHANGED" (yellow badge) section lists members whose rank, first name, or last name differs from stored values. ' +
            'Each row has a checked checkbox, rank and name metadata, and a diff for changed fields. ' +
            'If nothing to sync, the modal shows "All members are up to date — nothing to sync."',
    },
    {
        section: 'Import from OSM — Members',
        id: 'T5', title: 'Selective add — only checked new members are imported',
        steps: [
            'Open Import from OSM on the Members page.',
            'In the New section, uncheck at least one member.',
            'Click Apply Selected.',
            'Confirm the action in the dialog.',
            'Reload the Members page.',
        ],
        expected:
            'Only the checked members appear in the roster. The unchecked member is not added. ' +
            'The success toast shows the correct added/updated counts.',
    },
    {
        section: 'Import from OSM — Members',
        id: 'T6', title: 'Select All / Clear All buttons work per section',
        steps: [
            'Open Import from OSM.',
            'Click Clear All next to the New section.',
            'Verify all checkboxes in that section are unchecked.',
            'Click Select All next to the New section.',
            'Verify all checkboxes are re-checked.',
            'Verify Apply Selected counter updates to reflect the new total.',
        ],
        expected:
            'Clear All unchecks all items in that section only. ' +
            'Select All re-checks them. The "Apply Selected (N)" button count updates immediately.',
    },
    {
        section: 'Import from OSM — Members',
        id: 'T7', title: 'Changed members update only the ETL fields',
        steps: [
            'Ensure at least one member has NULL rank/first_name/last_name in the DB (pre-backfill state).',
            'Open Import from OSM.',
            'Verify the Changed section shows those members with null → value diffs.',
            'Select them and click Apply Selected.',
            'Open the Edit Member modal for one of those members.',
        ],
        expected:
            'The rank, first name, and last name fields are now populated. ' +
            'The member OSM ID is set. Email, mobile, and notification preference are unchanged.',
    },

    // ── Import from OSM — Skills ──────────────────────────────────────────────
    {
        section: 'Import from OSM — Skills',
        id: 'T8', title: 'Skill discover modal shows New and Changed sections',
        steps: [
            'Navigate to the Skills page.',
            'Click Import from OSM.',
            'Wait for the scan to complete.',
        ],
        expected:
            'The modal shows "NEW" skills not yet configured and "CHANGED" skills whose category differs. ' +
            'New skills display their derived category (e.g. "Pumps", "Operational Integrity"). ' +
            'Skills ending with "(C)" show a red Critical badge. ' +
            'Changed skills show a struck-through old category and the new category in green.',
    },
    {
        section: 'Import from OSM — Skills',
        id: 'T9', title: 'New skills are added with ETL fields populated',
        steps: [
            'Open Import from OSM on the Skills page.',
            'Select at least one new skill and click Apply Selected.',
            'Open the Edit Skill modal for the newly added skill.',
        ],
        expected:
            'The skill appears in the skills list. ' +
            'In the edit modal, OSM Skill ID equals the skill name. ' +
            'Category is populated with the derived value. Critical flag matches the (C) suffix detection.',
    },

    // ── Add / Edit Modals ─────────────────────────────────────────────────────
    {
        section: 'Add / Edit Modals',
        id: 'T10', title: 'Add Member modal shows all ETL fields unlocked',
        steps: [
            'Navigate to the Members page.',
            'Click Add Member.',
            'Observe the modal layout.',
        ],
        expected:
            'The modal shows two sections: "OSM Source" and "Parsed Fields". ' +
            '"OSM Source" contains Full Name (with a lock icon button) and OSM Member ID (with a lock icon button). ' +
            'In Add mode both fields are editable — no grey background, no readOnly state. ' +
            '"Parsed Fields" contains Rank, Last Name, and First Name in a 3-column grid.',
    },
    {
        section: 'Add / Edit Modals',
        id: 'T11', title: 'Edit Member modal locks matching-key fields by default',
        steps: [
            'Click the Edit (pencil) icon on any member.',
            'Observe the Full Name and OSM Member ID fields.',
            'Try to type in the Full Name field.',
            'Click the lock icon next to Full Name.',
            'Try to type in the Full Name field again.',
        ],
        expected:
            'Full Name and OSM Member ID open in a grey, read-only state (cursor shows not-allowed). ' +
            'Typing in the locked field has no effect. ' +
            'After clicking the lock icon it changes to an open-lock icon, the background clears, and the field becomes editable. ' +
            'Edited values save correctly when the form is submitted.',
    },
    {
        section: 'Add / Edit Modals',
        id: 'T12', title: 'Member ETL fields persist through save',
        steps: [
            'Open Add Member, fill in all fields including Rank="SO", Last Name="Test", First Name="T", OSM Member ID="SO Test, T".',
            'Save.',
            'Re-open the edit modal for that member.',
        ],
        expected:
            'All ETL fields are populated as entered. ' +
            'Rank shows "SO", Last Name shows "Test", First Name shows "T", OSM Member ID shows "SO Test, T".',
    },
    {
        section: 'Add / Edit Modals',
        id: 'T13', title: 'Add Skill modal shows OSM Skill ID and Category fields',
        steps: [
            'Navigate to the Skills page.',
            'Click Add Skill.',
            'Observe the "OSM Source" section.',
        ],
        expected:
            'The modal shows Skill Name (with lock icon) and OSM Skill ID (with lock icon) — both editable in add mode. ' +
            'A Category field appears below them. ' +
            'The existing Verification section (External URL / App Hosted Form tabs) is still present below.',
    },
    {
        section: 'Add / Edit Modals',
        id: 'T14', title: 'Edit Skill modal locks Skill Name and OSM Skill ID',
        steps: [
            'Click Edit on any skill.',
            'Observe Skill Name and OSM Skill ID.',
            'Click the lock icon on Skill Name.',
            'Edit the name and save.',
        ],
        expected:
            'Both fields are locked (grey, read-only) on open. ' +
            'After unlocking, the field becomes editable. ' +
            'The saved change persists.',
    },

    // ── FENZ Rank Ordering ────────────────────────────────────────────────────
    {
        section: 'FENZ Rank Ordering',
        id: 'T15', title: 'Dashboard: sort by Rank uses authority order',
        steps: [
            'Load the Dashboard and view expiring skills.',
            'Click the Rank column header to sort ascending.',
            'Observe the order of members.',
        ],
        expected:
            'Members are ordered by FENZ authority: CFO first, then DCFO, SSO, SO, SFF, QFF, FF, RFF. ' +
            'This is NOT alphabetical order (alphabetical would put CFO before DCFO before FF, ' +
            'but FF would incorrectly appear before QFF). ' +
            'Within the same rank, members are sorted alphabetically by surname.',
    },
    {
        section: 'FENZ Rank Ordering',
        id: 'T16', title: 'Members page: sort by Rank uses authority order',
        steps: [
            'Navigate to the Members page.',
            'Click the Rank column header.',
            'Observe the sort order.',
        ],
        expected:
            'Same authority order as T15. CFO appears at the top when sorted ascending.',
    },
    {
        section: 'FENZ Rank Ordering',
        id: 'T17', title: 'Live Forms page: sort by Rank uses authority order',
        steps: [
            'Navigate to Live Forms.',
            'Click the Rank column sort button.',
            'Observe the member order.',
        ],
        expected:
            'Members with higher authority rank (CFO, DCFO) appear first when sorted ascending.',
    },
    {
        section: 'FENZ Rank Ordering',
        id: 'T18', title: 'Survey Tracking / Results: sort by Rank uses authority order',
        steps: [
            'Navigate to a live survey with responses.',
            'Open Survey Tracking and sort by Rank.',
            'Repeat for Survey Results if responses are present.',
        ],
        expected:
            'Rank column sorts by authority order in both views.',
    },
    {
        section: 'FENZ Rank Ordering',
        id: 'T19', title: 'Descending rank sort reverses authority order',
        steps: [
            'On any page with a rank sort column, click Rank twice (ascending then descending).',
            'Observe the order.',
        ],
        expected:
            'Descending rank sort puts RFF (lowest authority) at the top and CFO at the bottom.',
    },
];

// ── Pass criteria table ───────────────────────────────────────────────────────

function buildPassCriteria(tests) {
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            cell([new Paragraph({ children: [bold('#', 20, WHITE)] })],       { shade: TEAL, width: 10 }),
            cell([new Paragraph({ children: [bold('Test', 20, WHITE)] })],    { shade: TEAL, width: 60 }),
            cell([new Paragraph({ children: [bold('Status', 20, WHITE)] })],  { shade: TEAL, width: 30 }),
        ],
    });
    const dataRows = tests.map((t, i) =>
        new TableRow({
            children: [
                cell([new Paragraph({ children: [normal(t.id)] })],    { shade: i % 2 === 0 ? WHITE : TEAL_LIGHT, width: 10 }),
                cell([new Paragraph({ children: [normal(t.title)] })], { shade: i % 2 === 0 ? WHITE : TEAL_LIGHT, width: 60 }),
                cell([new Paragraph({ children: [normal('')] })],      { shade: i % 2 === 0 ? WHITE : PASS_GREEN,  width: 30 }),
            ],
        })
    );
    return new Table({
        layout: TableLayoutType.FIXED,
        width:  { size: 100, type: WidthType.PERCENTAGE },
        rows:   [headerRow, ...dataRows],
    });
}

// ── Document ──────────────────────────────────────────────────────────────────

const SECTIONS_IN_ORDER = [
    'Backfill Script',
    'Import from OSM — Members',
    'Import from OSM — Skills',
    'Add / Edit Modals',
    'FENZ Rank Ordering',
];

const children = [
    // Cover
    new Paragraph({
        children: [new TextRun({ text: 'OpReady', bold: true, size: 36, color: TEAL })],
        spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
        children: [new TextRun({ text: 'UAT Testing Plan — ETL Fields, Sync & Rank Ordering', bold: true, size: 48, color: DARK_TEXT })],
        spacing: { after: 80 },
    }),
    new Paragraph({
        children: [italic('Branch: ETL-plugins  |  Date: 2026-06-03  |  Tester: ___________________', 20)],
        spacing: { after: 80 },
    }),
    new Paragraph({
        children: [italic('Continuation of UAT-ETL-Plugin-Refactor.docx — covers features built after T9.', 18, '666666')],
        spacing: { after: 160 },
    }),
    hRule(),

    // Scope
    sectionHeading('Scope'),
    new Paragraph({
        children: [normal(
            'This plan covers features introduced after the ETL Plugin Refactor UAT (UAT-ETL-Plugin-Refactor.docx): ' +
            'the backfill script, the enhanced Import from OSM diff UI for members and skills, ' +
            'the new ETL fields in add/edit modals with lock/unlock matching-key behaviour, ' +
            'and the FENZ rank authority ordering applied across all pages.'
        )],
        spacing: { after: 160 },
    }),

    // Environment
    sectionHeading('Test Environment'),
    new Table({
        layout: TableLayoutType.FIXED,
        width:  { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('APP_MODE')] })],          { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('demo')] })],             { shade: WHITE,       width: 72 }),
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('EXTRACTION_PLUGIN')] })], { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('html-scraper')] })],    { shade: WHITE,       width: 72 }),
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('DB state')] })],          { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('Backfill already run on all members and skills')] })], { shade: WHITE, width: 72 }),
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('Docker')] })],            { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('docker-compose up; run backfill scripts inside container')] })], { shade: WHITE, width: 72 }),
            ]}),
        ],
    }),
    spacer(200),
];

// Add sections and test cases
for (const sectionName of SECTIONS_IN_ORDER) {
    const sectionTests = TESTS.filter(t => t.section === sectionName);
    children.push(sectionHeading(sectionName));
    for (const t of sectionTests) {
        children.push(...testCase(t));
    }
}

// Pass criteria
children.push(
    sectionHeading('Pass Criteria'),
    new Paragraph({
        children: [normal('All T1–T19 must pass before the ETL-plugins branch is considered UAT-complete.')],
        spacing: { after: 100 },
    }),
    buildPassCriteria(TESTS),
    spacer(200),
    sectionHeading('Sign-off'),
    new Table({
        layout: TableLayoutType.FIXED,
        width:  { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('Tester name')] })],    { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('')] })],              { shade: WHITE,       width: 72 }),
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('Date completed')] })], { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('')] })],              { shade: WHITE,       width: 72 }),
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('Result')] })],         { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('PASS  /  FAIL')] })], { shade: WHITE,       width: 72 }),
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [bold('Notes')] })],          { shade: GREY_HEADER, width: 28 }),
                cell([new Paragraph({ children: [normal('')] })],              { shade: WHITE,       width: 72 }),
            ]}),
        ],
    }),
);

const doc = new Document({
    styles: {
        default: {
            document: { run: { font: 'Calibri', size: 22, color: DARK_TEXT } },
        },
    },
    sections: [{
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        children,
    }],
});

const outPath = path.join(__dirname, '..', 'UAT-ETL-Fields-and-Sync.docx');
Packer.toBuffer(doc).then(buffer => {
    fs.writeFileSync(outPath, buffer);
    console.log(`✔  Document written to: ${outPath}`);
});
