/**
 * Written content for "PDF Skills Report Plugin — Test Plan".
 * Audience: the people executing the tests on TST and UAT.
 *
 * The test cases themselves are read from UAT-TESTING-PLAN.md (the single source
 * of truth for manual acceptance tests), so this document never drifts from it.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { coverPage, tableOfContents, section, table, esc, wrapDocument } = require('../lib/guide-html');

const ROOT = path.join(__dirname, '..', '..', '..');

const list = (items) => `<ul class="doc-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const h3 = (t) => `<h3>${esc(t)}</h3>`;

/** Markdown cell → HTML: escape, then **bold** and `code`. */
function mdCell(text) {
    return esc(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** All "| Txx-nn | Action | Steps | Expected |" rows of the UAT plan, by ID. */
function loadUatCases() {
    const md = fs.readFileSync(path.join(ROOT, 'UAT-TESTING-PLAN.md'), 'utf8');
    const cases = new Map();
    for (const line of md.split(/\r?\n/)) {
        const m = /^\|\s*(T\d{2}-\d{2})\s*\|(.*)\|\s*$/.exec(line);
        if (!m) continue;
        // Sections differ in layout; only "Action | Steps | Expected" rows are usable here
        // (buildTestPlanHtml fails loudly if a case it needs is missing).
        const cells = m[2].split(/\s\|\s/).map((s) => s.trim());
        if (cells.length === 3) cases.set(m[1], { id: m[1], action: cells[0], steps: cells[1], expected: cells[2] });
    }
    return cases;
}

function idRange(prefix, from, to) {
    return Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${String(from + i).padStart(2, '0')}`);
}

const GROUPS = [
    {
        key: 'A', title: 'Skills Data Source — uploads and report history',
        intro: 'The new page, uploading reports by hand and through the API, the acceptance rules, the report history, and what survives a restart or a backup/restore. Run on TST first.',
        ids: [...idRange('T31', 1, 14), ...idRange('T31', 18, 22), ...idRange('T31', 33, 35)],
        figure: ['ds-after-upload', 'Expected after T31-04: the sample report is current, with its history row.'],
    },
    {
        key: 'B', title: 'Automatic pickup (Cloud Storage or local file)',
        intro: 'Only on a server configured with PDF_SOURCE=gcs (UAT) or PDF_SOURCE=local. Needs write access to the report object in the bucket (or to the local file).',
        ids: idRange('T31', 15, 17),
    },
    {
        key: 'C', title: 'Member name matching',
        intro: 'Matching the report\'s full names to members — automatic matches, names that need review or are not found, manual matches, and the full-first-name rule.',
        ids: idRange('T31', 23, 32),
        figure: ['ds-names', 'Expected in T31-23: names needing attention first, with their status and possible members.'],
    },
    {
        key: 'D', title: 'Dashboard',
        intro: 'Month labels, the six-month note, the unmatched-names banner and the report date on the home page.',
        ids: idRange('T02', 10, 13),
        figure: ['dash-top', 'Expected in T02-10 to T02-13 (with one name unmatched and Days to Expiry at 200).'],
    },
    {
        key: 'E', title: 'Reports and statistics',
        intro: 'Month labels, the 6m+ cells, the six-month note and the unmatched-names notes in reports and statistics.',
        ids: [...idRange('T11', 15, 17), 'T12-05'],
        figure: ['rpt-matrix', 'Expected in T11-15 and T11-17: the Compliance Matrix with 6m+ cells and the unmatched note.'],
    },
    {
        key: 'F', title: 'Notifications',
        intro: 'Use a member whose email/WhatsApp you can receive. Notifications are real — do not send to members who are not part of the test.',
        ids: ['T13-12'],
    },
    {
        key: 'G', title: 'Regression and technical checks',
        intro: 'Switching back to the OI dashboard plugin (TST only — it needs a restart) and the read-only API smoke run.',
        ids: ['T31-36', 'T31-37'],
    },
];

function caseTable(cases) {
    return table({
        headers: ['ID', 'Test', 'Steps', 'Expected result', 'Result'],
        widths: ['8%', '15%', '33%', '34%', '10%'],
        rows: cases.map((c) => [
            `<strong>${esc(c.id)}</strong>`,
            mdCell(c.action),
            mdCell(c.steps),
            mdCell(c.expected),
            '<span style="color:#999; font-size:0.85em;">☐ Pass<br>☐ Fail<br>☐ Blocked</span>',
        ]),
    });
}

function buildTestPlanHtml({ manifest, appVersion, generatedDate }) {
    const { shots } = manifest;
    const all = loadUatCases();
    const groups = GROUPS.map((g) => {
        const cases = g.ids.map((id) => {
            const c = all.get(id);
            if (!c) throw new Error(`Test case ${id} is not in UAT-TESTING-PLAN.md`);
            return c;
        });
        return { ...g, cases };
    });
    const total = groups.reduce((n, g) => n + g.cases.length, 0);

    const toc = [
        'About this test plan',
        'Test environments',
        'Before you start',
        'Order of execution',
        ...groups.map((g) => `Group ${g.key} — ${g.title} (${g.cases.length})`),
        'Event Log checklist',
        'Recording results and defects',
        'Sign-off',
    ];

    const body = [
        coverPage({
            title: 'PDF Skills Report Plugin — Test Plan',
            subtitle: 'Manual acceptance tests for reading skill expiry data from the "Skills Expiring in the Next Six Months" PDF report, on TST and UAT',
            appVersion,
            generatedDate,
        }),
        tableOfContents(toc),

        section({
            kicker: '1',
            heading: 'About this test plan',
            paragraphs: [
                `This plan checks the new <strong>pdf-report</strong> extraction plugin end to end: getting reports into OpReady, matching report names to members, and how the dashboard, notifications, reports and statistics behave with the new data. It contains <strong>${total} test cases</strong> in ${groups.length} groups.`,
                'The test cases are taken word for word from the project\'s UAT Testing Plan (sections T02, T11, T12, T13 and T31), which remains the master copy — if the two ever differ, regenerate this document (<code>npm run guide:pdf-report</code>).',
                'A companion document, <em>PDF Skills Report Plugin — Implementation Report</em>, explains the feature in full. Read its sections 2–6 before testing.',
            ],
            blocks: [
                h3('In scope'),
                list([
                    'TST (Raspberry Pi) — all groups except B; uploads by hand and by API.',
                    'UAT (Google Cloud Run) — group B (Cloud Storage pickup) plus a repeat of groups A, C and D on real infrastructure.',
                ]),
                h3('Out of scope'),
                list([
                    'PROD — only after sign-off.',
                    'DEMO — stays on the OI dashboard plugin; the PDF plugin refuses to run in demo mode (covered by T31-22 and the implementation report).',
                    'The OI dashboard plugin itself, beyond the switch-back check in group G.',
                ]),
            ],
            pageBreakBefore: true,
        }),

        section({
            kicker: '2',
            heading: 'Test environments',
            blocks: [
                table({
                    headers: ['Environment', 'Required settings', 'Reports arrive by', 'Groups'],
                    widths: ['16%', '38%', '28%', '18%'],
                    rows: [
                        ['<strong>TST</strong> (Raspberry Pi, Docker)', '<code>EXTRACTION_PLUGIN=pdf-report</code><br><code>PDF_SOURCE=upload</code>', 'Upload on the page; API (curl / n8n)', 'A, C, D, E, F, G'],
                        ['<strong>UAT</strong> (Cloud Run)', '<code>EXTRACTION_PLUGIN=pdf-report</code><br><code>PDF_SOURCE=gcs</code><br><code>PDF_GCS_BUCKET</code> (if not <code>GCS_BUCKET_NAME</code>)', 'Cloud Storage object <code>OSM-Status-6-months.pdf</code>; upload', 'B, then A, C, D'],
                        ['<strong>DEV</strong> (optional, local)', '<code>EXTRACTION_PLUGIN=pdf-report</code><br><code>PDF_SOURCE=local</code>', 'File in <code>storage/extraction/</code>', 'B (local variant)'],
                    ],
                }),
                '<p>Optional settings: <code>PDF_MAX_SIZE_MB</code> (default 10), <code>PDF_STALE_WARN_DAYS</code> (default 35). Database migrations 029 and 030 apply automatically on start-up.</p>',
            ],
            pageBreakBefore: true,
        }),

        section({
            kicker: '3',
            heading: 'Before you start',
            blocks: [
                h3('Deployment'),
                list([
                    'Deploy the <code>ETL-PDF-plugin</code> build to the environment with the settings in section 2, and check the start-up log shows <em>Active plugin: pdf-report</em>.',
                    'Log in as an administrator. Create an <strong>admin</strong> API key (API Management) for T31-19 and T31-37.',
                    'Have a second, <strong>simple</strong>-role user for T31-02 and T02-12.',
                ]),
                h3('Members and skills'),
                list([
                    'Members named in the OI dashboard format ("QFF Skywalker, L") for most people in the report.',
                    'For one report name, <strong>two</strong> members with the same surname and initial (needs review).',
                    'One report name with <strong>no</strong> member at all (not found).',
                    'One member who already has a <strong>full</strong> first name (for T31-27).',
                    'The report\'s skills configured and enabled in Manage Skills, at least one marked critical.',
                    'For T13-12: a member whose email (and WhatsApp, if used) you can receive, with an expiring and a lapsed skill.',
                ]),
                h3('Report files'),
                list([
                    'The current real report, and an older one (or generate fictional ones — see below).',
                    'A text file renamed to <code>test.pdf</code>; an unrelated PDF; a PDF over the size limit; a report cut to half its size; a password-protected PDF.',
                    '<strong>Fictional reports:</strong> <code>npm run sample:skills-report -- --created YYYY-MM-DD --out file.pdf</code> creates a report in the FENZ layout with the demo database\'s Star Wars members. Use these whenever the real report must not be used (shared screens, recordings, defect attachments).',
                ]),
                h3('Access'),
                list([
                    'UAT group B: write access to the report object in the Cloud Storage bucket (or to the local file for the DEV variant).',
                    'For T31-34: access to Backup &amp; Restore (superadmin).',
                    'For T31-36: the ability to change environment variables and restart TST.',
                ]),
                '<div class="tip-box"><strong>Confidential data</strong><ul><li>The real report is confidential to FENZ. Never attach it, or screenshots showing real names, to defect reports or chats — reproduce with a fictional report instead.</li></ul></div>',
            ],
            pageBreakBefore: true,
        }),

        section({
            kicker: '4',
            heading: 'Order of execution',
            paragraphs: ['Some tests build on the state left by earlier ones. On a fresh environment, this order works well:'],
            blocks: [table({
                headers: ['Step', 'Run', 'Why'],
                widths: ['8%', '32%', '60%'],
                rows: [
                    ['1', 'T31-01 to T31-03, T31-22 (DEMO)', 'Page, access and guards before any data exists.'],
                    ['2', 'T31-04 to T31-14, T31-18 to T31-21', 'Uploads and history. Upload the <em>current</em> report last so it is current for the next steps.'],
                    ['3', 'T31-23 to T31-32', 'Name matching — leave one name unmatched afterwards for steps 4 and 5.'],
                    ['4', 'T02-10 to T02-13, T13-12', 'Dashboard and notifications with an unmatched name present.'],
                    ['5', 'T11-15 to T11-17, T12-05', 'Reports and statistics.'],
                    ['6', 'T31-33 to T31-35', 'Restart, backup/restore and bad files.'],
                    ['7', 'T31-36, T31-37', 'Switch-back (TST) and API smoke run.'],
                    ['8', 'T31-15 to T31-17', 'UAT / automatic pickup, then repeat steps 2–4 on UAT.'],
                ],
            })],
            pageBreakBefore: true,
        }),

        ...groups.map((g, i) => section({
            kicker: `${5 + i} — Group ${g.key}`,
            heading: g.title,
            paragraphs: [esc(g.intro)],
            blocks: [caseTable(g.cases)],
            figures: g.figure && shots[g.figure[0]] ? [{ file: shots[g.figure[0]], caption: g.figure[1] }] : [],
            pageBreakBefore: true,
        })),

        section({
            kicker: `${5 + groups.length}`,
            heading: 'Event Log checklist',
            paragraphs: ['After the run, open the Event Log and confirm each entry below exists with your name (or System) as actor and a filled-in payload:'],
            blocks: [table({
                headers: ['Category', 'Title', 'Produced by', 'Seen'],
                widths: ['14%', '34%', '40%', '12%'],
                rows: [
                    ['System', 'Skills Report Uploaded', 'T31-04, T31-09, T31-19', '☐'],
                    ['System', 'Skills Report Imported', 'T31-15 (UAT)', '☐'],
                    ['System', 'Skills Report Rejected', 'T31-17 (UAT)', '☐'],
                    ['System', 'Skills Report Deleted', 'T31-13, T31-14', '☐'],
                    ['Member', 'Member Name Matched Automatically (actor System)', 'T31-24', '☐'],
                    ['Member', 'Member Name Matched', 'T31-25, T31-26, T31-28', '☐'],
                    ['Member', 'Member Name Match Removed', 'T31-29', '☐'],
                ],
            })],
            figures: shots['event-log'] ? [{ file: shots['event-log'], caption: 'Example: Event Log after uploading and matching names.' }] : [],
            pageBreakBefore: true,
        }),

        section({
            kicker: `${6 + groups.length}`,
            heading: 'Recording results and defects',
            blocks: [
                list([
                    'Tick <strong>Pass</strong>, <strong>Fail</strong> or <strong>Blocked</strong> for each case; the same cases are in <code>UAT-TESTING-PLAN.csv</code> for a spreadsheet run tracker (Status, Notes, Tester, Run Date columns).',
                    'For a failure, record: test ID, environment, date and time, what you did, what you expected, what happened, and a screenshot — using a fictional report wherever possible.',
                    'Note the report date shown on the dashboard and the Skills Data Source status at the time; for automatic pickup failures, also the "Last check" message.',
                    'Severity: <strong>High</strong> — wrong skill data shown or notified, data lost, or a report accepted that should not be; <strong>Medium</strong> — a feature does not work but data is safe; <strong>Low</strong> — wording, layout.',
                ]),
            ],
            pageBreakBefore: true,
        }),

        section({
            kicker: `${7 + groups.length}`,
            heading: 'Sign-off',
            blocks: [table({
                headers: ['Environment', 'Groups run', 'Passed / total', 'Open defects', 'Tester', 'Date', 'Accepted'],
                widths: ['13%', '14%', '14%', '15%', '16%', '12%', '16%'],
                rows: [
                    ['TST', 'A, C, D, E, F, G', '&nbsp;', '&nbsp;', '&nbsp;', '&nbsp;', '☐ Yes ☐ No'],
                    ['UAT', 'B, A, C, D', '&nbsp;', '&nbsp;', '&nbsp;', '&nbsp;', '☐ Yes ☐ No'],
                ],
            })],
            pageBreakBefore: false,
        }),
    ];

    return wrapDocument(body.join('\n'));
}

module.exports = { buildTestPlanHtml, loadUatCases };
