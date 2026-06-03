#!/usr/bin/env node
/**
 * generate-uat-etl-plugin.js
 *
 * Generates a Word (.docx) UAT testing plan for the ETL Plugin refactor
 * introduced in the ETL-plugins branch.
 *
 * Usage:
 *   node scripts/generate-uat-etl-plugin.js
 *   npm run generate-uat-etl-plugin
 *
 * Output: UAT-ETL-Plugin-Refactor.docx (project root)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
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

function bold(text, size = 22, color = DARK_TEXT) {
    return new TextRun({ text, bold: true, size, color });
}

function normal(text, size = 20, color = DARK_TEXT) {
    return new TextRun({ text, size, color });
}

function italic(text, size = 20, color = '555555') {
    return new TextRun({ text, italics: true, size, color });
}

function cell(children, options = {}) {
    return new TableCell({
        children: Array.isArray(children) ? children : [new Paragraph({ children: [children] })],
        shading: options.shade ? { type: ShadingType.CLEAR, fill: options.shade } : undefined,
        width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        ...options.cellOpts,
    });
}

function twoColTable(rows) {
    return new Table({
        layout: TableLayoutType.FIXED,
        width:  { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(([label, value]) =>
            new TableRow({
                children: [
                    cell([new Paragraph({ children: [bold(label)] })],   { shade: GREY_HEADER, width: 28 }),
                    cell([new Paragraph({ children: [normal(value)]  })], { shade: WHITE,       width: 72 }),
                ],
            })
        ),
    });
}

function stepsTable(steps) {
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            cell([new Paragraph({ children: [bold('#', 20, WHITE)] })],     { shade: TEAL, width: 8  }),
            cell([new Paragraph({ children: [bold('Step', 20, WHITE)] })],  { shade: TEAL, width: 92 }),
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
        new Paragraph({ children: [normal(expected)], spacing: { after: note ? 80 : 160 } }),
    ];
    if (note) {
        elements.push(
            new Paragraph({
                children: [italic(`Note: ${note}`)],
                spacing: { after: 180 },
            })
        );
    }
    return elements;
}

// ── Document definition ───────────────────────────────────────────────────────

const tests = [
    {
        id: 'T1', title: 'Server startup with plugin log',
        steps: [
            'Start the server: npm start',
            'Check the console output immediately after startup.',
        ],
        expected:
            'Server starts without errors. Console contains the line: ' +
            '"[ExtractionEngine] Active plugin: html-scraper — Scrapes the OI HTML dashboard page...". ' +
            'No "Cannot find module \'./scraper\'" or similar errors appear.',
    },
    {
        id: 'T2', title: 'Dashboard: data load uses cache on second call',
        steps: [
            'Navigate to the Dashboard.',
            'Click View Expiring Skills and wait for the member list to appear.',
            'Without enabling Force Refresh, click View Expiring Skills again.',
        ],
        expected:
            'First load: terminal output contains "Running plugin \\"html-scraper\\"". ' +
            'Second load: terminal output contains "Using cached data" — no re-fetch occurs. ' +
            'Member skill table renders identically both times.',
    },
    {
        id: 'T3', title: 'Dashboard: force refresh bypasses cache',
        steps: [
            'Load the Dashboard and wait for data to appear.',
            'Enable the Force Refresh toggle.',
            'Click View Expiring Skills.',
        ],
        expected:
            'Terminal output contains "Running plugin \\"html-scraper\\"" (not the cache message). ' +
            'Data reloads successfully and the member table updates.',
    },
    {
        id: 'T4', title: 'Member discovery still works',
        steps: [
            'Navigate to Members.',
            'Click Import from OSM.',
        ],
        expected:
            'A list of discoverable member names appears (sourced from the demo file). ' +
            'No error toast or console error.',
    },
    {
        id: 'T5', title: 'Skill discovery still works',
        steps: [
            'Navigate to Skills.',
            'Click Import from OSM.',
        ],
        expected:
            'A list of discoverable skill names appears. No error toast or console error.',
    },
    {
        id: 'T6', title: 'Notification queue still processes',
        steps: [
            'Navigate to the Dashboard and load expiring skills.',
            'Select at least one member.',
            'Click Send Notifications.',
        ],
        expected:
            'Terminal progress output appears per member. ' +
            'Demo mode shows "[DEMO] Email simulated" messages. ' +
            'Process completes with a green / exit-code-0 status.',
    },
    {
        id: 'T7', title: 'Reports still generate',
        steps: [
            'Navigate to Reports.',
            'Select the By Member report and generate it.',
            'Select the Compliance Matrix report and generate it.',
        ],
        expected:
            'Both reports render with member and skill data. No blank report or error message appears.',
    },
    {
        id: 'T8', title: 'Unimplemented plugin fails gracefully',
        steps: [
            'Stop the server.',
            'Add EXTRACTION_PLUGIN=rest-api to .env.',
            'Restart the server.',
            'Navigate to the Dashboard and attempt to load expiring skills.',
            'Observe the server console and any UI error message.',
            'Restore EXTRACTION_PLUGIN=html-scraper (or remove the line) and confirm the server returns to normal.',
        ],
        expected:
            'Server starts (plugin loads with a validation warning, not a crash). ' +
            'Console shows: "[ExtractionEngine] Plugin config warning: rest-api plugin is not yet implemented." ' +
            'When data load is triggered a clear error message appears — not an unhandled crash.',
    },
    {
        id: 'T9', title: 'Name fields parsed correctly (server-side)',
        steps: [
            'With the server running in demo mode, trigger a data load from the Dashboard.',
            'Check the server console or run: npm test -- --testPathPattern=scraper',
        ],
        expected:
            'The first extracted record for "QFF Skywalker, L" contains: ' +
            'rank = "QFF", lastName = "Skywalker", firstName = "L". ' +
            'All three parsed fields are non-empty for every demo member.',
        note:
            'rank, lastName and firstName are not yet surfaced in the UI. ' +
            'The unit tests in tests/scraper.test.js are the primary automated verification for this field.',
    },
];

const passCriteriaTable = new Table({
    layout: TableLayoutType.FIXED,
    width:  { size: 100, type: WidthType.PERCENTAGE },
    rows: [
        new TableRow({
            tableHeader: true,
            children: [
                cell([new Paragraph({ children: [bold('#', 20, WHITE)] })],       { shade: TEAL, width: 10 }),
                cell([new Paragraph({ children: [bold('Test', 20, WHITE)] })],    { shade: TEAL, width: 60 }),
                cell([new Paragraph({ children: [bold('Status', 20, WHITE)] })],  { shade: TEAL, width: 30 }),
            ],
        }),
        ...tests.map((t, i) =>
            new TableRow({
                children: [
                    cell([new Paragraph({ children: [normal(t.id)] })],    { shade: i % 2 === 0 ? WHITE : TEAL_LIGHT, width: 10 }),
                    cell([new Paragraph({ children: [normal(t.title)] })], { shade: i % 2 === 0 ? WHITE : TEAL_LIGHT, width: 60 }),
                    cell([new Paragraph({ children: [normal('')] })],      { shade: i % 2 === 0 ? WHITE : PASS_GREEN,  width: 30 }),
                ],
            })
        ),
    ],
});

const doc = new Document({
    styles: {
        default: {
            document: {
                run: { font: 'Calibri', size: 22, color: DARK_TEXT },
            },
        },
    },
    sections: [{
        properties: {
            page: {
                margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
            },
        },
        children: [
            // ── Cover block ─────────────────────────────────────────────────
            new Paragraph({
                children: [new TextRun({ text: 'OpReady', bold: true, size: 36, color: TEAL })],
                spacing: { before: 0, after: 80 },
            }),
            new Paragraph({
                children: [new TextRun({ text: 'UAT Testing Plan — ETL Plugin Refactor', bold: true, size: 52, color: DARK_TEXT })],
                spacing: { after: 80 },
            }),
            new Paragraph({
                children: [italic('Branch: ETL-plugins  |  Date: 2026-06-03  |  Tester: ___________________', 20)],
                spacing: { after: 160 },
            }),
            hRule(),

            // ── Scope ────────────────────────────────────────────────────────
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: 'Scope', bold: true, size: 28, color: TEAL })],
                spacing: { before: 200, after: 80 },
            }),
            new Paragraph({
                children: [normal(
                    'This plan covers only the changes introduced in the ETL-plugins session: ' +
                    'the Extraction Engine (services/extraction-engine.js), the HTML Scraper plugin ' +
                    '(services/plugins/html-scraper.plugin.js), the Name Parser ' +
                    '(services/plugins/name-parser.js), the REST API plugin stub, ' +
                    'and the removal of services/scraper.js.'
                )],
                spacing: { after: 160 },
            }),

            // ── Test Environment ─────────────────────────────────────────────
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: 'Test Environment', bold: true, size: 28, color: TEAL })],
                spacing: { before: 200, after: 80 },
            }),
            twoColTable([
                ['APP_MODE',          'demo'],
                ['EXTRACTION_PLUGIN', 'html-scraper  (default — no .env change needed for T1–T7)'],
                ['Server port',       '3000  (or as configured)'],
            ]),
            spacer(200),

            // ── Test Cases ───────────────────────────────────────────────────
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: 'Test Cases', bold: true, size: 28, color: TEAL })],
                spacing: { before: 200, after: 80 },
            }),

            ...tests.flatMap((t) => testCase(t)),

            // ── Pass Criteria ────────────────────────────────────────────────
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: 'Pass Criteria', bold: true, size: 28, color: TEAL })],
                spacing: { before: 240, after: 80 },
            }),
            new Paragraph({
                children: [normal('All T1–T8 must pass. T9 is informational — covered by automated unit tests (npm test).')],
                spacing: { after: 100 },
            }),
            passCriteriaTable,
            spacer(200),

            // ── Sign-off ─────────────────────────────────────────────────────
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: 'Sign-off', bold: true, size: 28, color: TEAL })],
                spacing: { before: 200, after: 80 },
            }),
            twoColTable([
                ['Tester name',   ''],
                ['Date completed', ''],
                ['Result',        'PASS  /  FAIL'],
                ['Notes',         ''],
            ]),
        ],
    }],
});

// ── Write output ──────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, '..', 'UAT-ETL-Plugin-Refactor.docx');
Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(outPath, buffer);
    console.log(`✔  Document written to: ${outPath}`);
});
