/**
 * Written content for "PDF Skills Report Plugin — Implementation Report".
 * Audience: brigade administrators and the people who deploy/operate OpReady.
 * All screenshots come from capture.js (fictional sample report + demo members).
 */

'use strict';

const {
    coverPage, tableOfContents, section, table, esc, wrapDocument,
} = require('../lib/guide-html');

const list = (items) => `<ul class="doc-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const h3 = (t) => `<h3>${esc(t)}</h3>`;

function buildReportHtml({ manifest, appVersion, generatedDate }) {
    const { shots, data } = manifest;
    const fig = (key, caption, mobile = false) => (shots[key] ? [{ file: shots[key], caption, mobile }] : []);
    const sample = data.sample || {};

    const toc = [
        'Summary',
        'The skills report and how it is read',
        'Getting reports into OpReady',
        'The Skills Data Source page',
        'Matching report names to members',
        'What changes across the app',
        'Configuration',
        'API reference',
        'Data, security and confidentiality',
        'Limitations and things to know',
        'How it was built and verified',
        'Next steps',
    ];

    const body = [
        coverPage({
            title: 'PDF Skills Report Plugin',
            subtitle: 'Implementation report — what was built, and how OpReady behaves when skill expiry data comes from the "Skills Expiring in the Next Six Months" PDF report',
            appVersion,
            generatedDate,
        }),
        tableOfContents(toc),

        // ── 1. Summary ─────────────────────────────────────────────────────
        section({
            kicker: '1',
            heading: 'Summary',
            paragraphs: [
                'OpReady has always read each member\'s skill expiry dates from the OI dashboard web page. That page may stop being available, so OpReady can now read the same information from the <strong>"Skills Expiring in the Next Six Months"</strong> PDF report that FENZ sends by email. The new source is a separate <em>extraction plugin</em> (<code>pdf-report</code>); the existing OI dashboard plugin (<code>html-scraper</code>) is unchanged and can be switched back to at any time.',
                'The PDF carries less information than the dashboard did. It only lists skills that are lapsed or due within six months, it gives the month a skill expires rather than the day, and it names people in full ("Luke Skywalker") without their rank. The work therefore covered more than reading the PDF: how reports arrive, how report names are matched to members, and how every screen, notification and report explains the gaps honestly.',
            ],
            blocks: [
                h3('What was delivered'),
                list([
                    '<strong>A reader for the PDF report</strong> that turns its grid into one entry per member and skill, works out a due date from the month, and refuses anything it cannot read rather than guessing.',
                    '<strong>Three ways for a report to arrive</strong> — upload on a new <strong>Skills Data Source</strong> page, upload by an automation (e.g. an n8n workflow) through the API, or automatic pickup from Google Cloud Storage or a local file. Every accepted report is kept, with the original PDF, in a history of the last 24.',
                    '<strong>Member name matching</strong> — names are matched to members automatically when it is safe, and an administrator resolves the rest. Matches are remembered for future reports.',
                    '<strong>Honest presentation everywhere</strong> — months instead of invented days ("Nov 2026", "Lapsed"), a "6m+" cell in the compliance matrix, notes when a question goes beyond six months, the report date on the dashboard, and warnings wherever an unmatched name means someone\'s skills are missing.',
                    '<strong>Documentation and tests</strong> — help text, README, API documentation, the UAT plan (and the companion test plan document), 800+ automated tests, and a fictional sample report generator for demonstrations and testing.',
                ]),
            ],
            pageBreakBefore: true,
        }),

        // ── 2. The report ──────────────────────────────────────────────────
        section({
            kicker: '2',
            heading: 'The skills report and how it is read',
            paragraphs: [
                'Each page of the report is a grid: one row per skill, grouped under yellow category bands ("B.A", "Driving", "Haz Subs" …), with a <strong>Lapsed</strong> column followed by the next six months. A member\'s name appears in the column of the month their skill expires. Names in <span style="color:#e08800; font-weight:600;">orange</span> expire within one month of the date the report was created, which is printed in the footer ("Created: 5/10/2026").',
                'The figure below is a <strong>fictional sample</strong> produced by OpReady\'s sample generator — the real report is confidential to FENZ and is never reproduced in these documents.',
            ],
            figures: fig('sample-report', 'A fictional sample report in the same layout as the FENZ report (generated by npm run sample:skills-report).'),
            pageBreakBefore: true,
        }),
        section({
            heading: 'From months to due dates',
            paragraphs: [
                'OpReady works out what is expired or expiring from dates, so every entry is given a due date derived from the report\'s Created date. The rules were chosen so that nothing is shown as expired when the report says it is not, and nothing is shown later than it could be:',
            ],
            blocks: [
                table({
                    headers: ['Where the name appears', 'Due date used', 'Example (report created 5 Oct 2026)'],
                    widths: ['38%', '32%', '30%'],
                    rows: [
                        ['<strong>Lapsed</strong> column', 'Last day of the month before the report month', '30 Sep 2026'],
                        ['The report\'s own month (always orange)', 'Last day of that month — not yet lapsed according to the report', '31 Oct 2026'],
                        ['Next month, <span style="color:#e08800;">orange</span>', '1st of that month — it expires before the Created day', '1 Nov 2026'],
                        ['Next month, black', 'The Created day in that month — the earliest it can be', '5 Nov 2026'],
                        ['Any later month', '1st of that month', '1 Dec 2026 … 1 Mar 2027'],
                    ],
                }),
                'People never see these derived days: everywhere a date is shown to a person it reads as the month ("Nov 2026") or "Lapsed". The category bands become each skill\'s category, and skill names are kept exactly as the report spells them.',
                h3('When a report cannot be read'),
                list([
                    'The file must start like a PDF and be within the size limit (10 MB by default) before it is even opened.',
                    'It must have the "Skill Name / Lapsed / months" header on every page, six consecutive months, a Created date, and at least one entry. Anything else is refused with a clear message and <strong>nothing changes</strong> — OpReady never replaces good data with a partial read.',
                    'Smaller oddities (a black name in the report month, an orange name more than a month out, an unexpected colour, a duplicate) are accepted but listed as <em>parser warnings</em> on the Skills Data Source page.',
                ]),
            ].map((b) => (b.trimStart().startsWith('<') ? b : `<p>${b}</p>`)),
        }),

        // ── 3. Getting reports in ──────────────────────────────────────────
        section({
            kicker: '3',
            heading: 'Getting reports into OpReady',
            paragraphs: [
                'Every route a report can take ends in the same place: it is checked, read, and stored as the new <strong>current report</strong>, together with the original PDF. The newest accepted report is the data the whole app uses.',
            ],
            blocks: [
                table({
                    headers: ['Route', 'Who / when', 'How it works'],
                    widths: ['20%', '30%', '50%'],
                    rows: [
                        ['<strong>Upload</strong>', 'An administrator, any environment', 'Choose or drop the PDF on <strong>Operations → Maintenance → Skills Data Source</strong> and click Upload Report.'],
                        ['<strong>API upload</strong>', 'An automation, e.g. n8n receiving the report email (planned for TST)', '<code>POST /api/extraction/upload</code> with the PDF in the <code>file</code> field and an admin API key. The reply says <code>imported</code> or <code>unchanged</code>.'],
                        ['<strong>Google Cloud Storage</strong>', 'UAT and PROD (Cloud Run), with <code>PDF_SOURCE=gcs</code>', 'Your workflow overwrites <code>OSM-Status-6-months.pdf</code> in the bucket. OpReady checks the object\'s version whenever skill data refreshes and downloads it only when it is new. <strong>Check Source Now</strong> checks immediately.'],
                        ['<strong>Local file</strong>', 'DEV, with <code>PDF_SOURCE=local</code>', 'Copy the report to <code>storage/extraction/OSM-Status-6-months.pdf</code>; it is picked up the same way.'],
                    ],
                }),
                h3('Rules for accepting a report'),
                list([
                    'It must be read cleanly (see section 2).',
                    'If it is byte-for-byte the same as the current report, nothing happens ("unchanged").',
                    'If it was created <strong>before</strong> the current report it is refused — on the page you are asked to confirm, and an automation can resend with <code>force=true</code>. Automatic pickup never imports an older report over a newer one.',
                    'A bad file found at the automatic source is refused once and logged; it is not retried every hour.',
                    'The last 24 reports are kept (about two years of monthly reports); older ones are removed automatically.',
                ]),
            ],
            pageBreakBefore: true,
        }),

        // ── 4. Skills Data Source page ─────────────────────────────────────
        section({
            kicker: '4',
            heading: 'The Skills Data Source page',
            paragraphs: [
                'A new page under <strong>Operations → Maintenance</strong>, for administrators. It shows where skill data currently comes from and lets you manage reports and name matching. Before any report has been imported it looks like this:',
            ],
            figures: fig('ds-empty', 'Skills Data Source before the first report.'),
        }),
        section({
            heading: 'After an upload',
            paragraphs: [
                '<strong>Current Report</strong> shows the report date (with an <em>Out of date</em> badge once it is older than 35 days by default), who imported it and how, how many entries, members and skills it contains, any parser warnings, and — when automatic pickup is configured — where reports are collected from and the result of the last check.',
            ],
            figures: [
                ...fig('ds-current', 'Current Report after uploading the sample report.'),
                ...fig('ds-history', 'Report History: the newest report is current; each report can be downloaded or deleted.'),
            ],
            tips: [
                'Deleting the current report makes the previous one current again — useful if a wrong file was uploaded.',
                'Uploading the same file twice changes nothing. An older report asks for confirmation first:',
            ],
        }),
        section({
            heading: 'Older reports need confirmation',
            paragraphs: ['If the chosen report was created before the current one, OpReady explains this and asks before replacing newer data.'],
            figures: fig('ds-older-confirm', 'Uploading a report created before the current one.'),
            pageBreakBefore: false,
        }),

        // ── 5. Name matching ──────────────────────────────────────────────
        section({
            kicker: '5',
            heading: 'Matching report names to members',
            paragraphs: [
                'Members in OpReady are named the way the OI dashboard named them ("QFF Skywalker, L"); the report uses full names ("Luke Skywalker"). Every name in the report must be linked to a member before that person\'s skills count. OpReady does most of this by itself:',
            ],
            blocks: [
                list([
                    'A name is matched <strong>automatically</strong> when exactly <strong>one</strong> member has the same surname and the same first initial (a matching full first name decides between two). Compound surnames and accents are handled.',
                    'It is <strong>not</strong> matched automatically when two members fit equally well (<em>Needs review</em>), when no member fits (<em>Not found</em>), when the member is already linked to a different report name, or when two report names would land on the same member.',
                    'An administrator resolves those with <strong>Match</strong>. Matches — automatic or manual — are saved and reused for every future report. <strong>Change</strong> re-links a name; <strong>Unlink</strong> removes a manual match so automatic matching applies again.',
                    'When a matched member only has an initial as first name, the full first name from the report is saved (so the member shows as "QFF Skywalker, Luke"). An existing full first name is never overwritten, and switching back to the OI dashboard never turns it back into an initial.',
                    'Skill names are matched to configured skills ignoring differences in spacing, dashes and capitals; the configured spelling is kept.',
                ]),
            ],
            figures: fig('ds-names', 'Member Name Matching after the first refresh: names needing attention are listed first.'),
            pageBreakBefore: true,
        }),
        section({
            heading: 'Resolving a name',
            paragraphs: [
                'Automatic matching runs whenever skill data is refreshed (for example when the dashboard loads), so right after an upload some names may show <em>Will match automatically</em>. For a name that needs review, <strong>Match</strong> opens a window listing the possible members first, then everyone:',
            ],
            figures: [
                ...fig('ds-match-modal', 'Choosing the member for an ambiguous name.'),
                ...fig('ds-names-after-match', 'After saving: the name is Matched by admin and the attention count drops.'),
            ],
            tips: [
                'A new member must be added in Manage Members first; then match the report name to them.',
                'Until a name is matched, that person\'s skills appear nowhere and they are not notified — which is why the dashboard, reports and statistics now warn about it (section 6).',
            ],
        }),

        // ── 6. App behaviour ──────────────────────────────────────────────
        section({
            kicker: '6',
            heading: 'What changes across the app',
            paragraphs: [
                'Everything below applies only while the PDF plugin is active. With the OI dashboard plugin, every screen looks and behaves exactly as before.',
            ],
            blocks: [
                h3('Dashboard'),
                list([
                    '<strong>Report created: &lt;date&gt;</strong> appears on the right of the Expiring Skills List title, so everyone can see how current the data is.',
                    'Due dates show the month ("Nov 2026") or <strong>Lapsed</strong> (still highlighted as expired); hovering explains the report only gives the month.',
                    'If <em>Days to Expiry</em> is set beyond about six months, a note explains later skills cannot be shown.',
                    'A yellow banner appears while any report name is unmatched — with a link to Skills Data Source for administrators.',
                ]),
            ],
            figures: fig('dash-top', 'The dashboard with the sample report: report date, six-month note, unmatched-names banner and month labels.'),
            pageBreakBefore: true,
        }),
        section({
            heading: 'Notifications, reports and statistics',
            blocks: [
                h3('Email and WhatsApp notifications'),
                '<p>Wherever a template uses <code>{{date}}</code>, the message reads the month ("Nov 2026") or "Lapsed" instead of a full date. People whose names are unmatched are not notified — the dashboard banner says so before anything is sent.</p>',
                h3('Reports'),
                list([
                    '<strong>Compliance Matrix:</strong> a tracked skill that is not in the report shows a pale green <strong>6m+</strong> cell ("not in the six-month report — not due within six months") instead of the grey Missing dot.',
                    '<strong>Grouped by Member / by Skill, Critical Overdue, Planned Sessions, Training Attendance:</strong> due dates show the month.',
                    'Grouped by Member and by Skill add a note when the days threshold goes beyond six months.',
                    'Grouped by Member, by Skill, Critical Overdue and the Compliance Matrix add a red note while any report name is unmatched — Critical Overdue adds that their skills may also be overdue, even when it otherwise reports none.',
                ]),
                h3('Statistics'),
                '<p>The Overall Compliance Overview notes how many report names are unmatched and therefore not counted in its charts.</p>',
            ],
            figures: [
                ...fig('rpt-matrix', 'Compliance Matrix: 6m+ cells, month labels on hover, unmatched-names note and the updated key.'),
            ],
        }),
        section({
            heading: 'Reports and statistics — examples',
            figures: [
                ...fig('rpt-by-member', 'Grouped by Member at 200 days: six-month note, unmatched note and month labels.'),
                ...fig('stats', 'Overall Compliance Overview with the unmatched-names note.'),
            ],
        }),
        section({
            heading: 'On a phone',
            paragraphs: ['The new page and the dashboard additions follow the app\'s mobile layout: tables become cards and the report date sits under the list title.'],
            figures: [
                ...fig('m-dashboard', 'Dashboard on a phone.', true),
                ...fig('m-names', 'Member name matching on a phone.', true),
            ],
        }),

        // ── 7. Configuration ──────────────────────────────────────────────
        section({
            kicker: '7',
            heading: 'Configuration',
            paragraphs: ['All settings are environment variables (see <code>.example.env</code>; <code>npm run setup-env</code> shows them with dropdowns). Nothing needs changing for environments that keep using the OI dashboard.'],
            blocks: [
                table({
                    headers: ['Variable', 'Default', 'Purpose'],
                    widths: ['26%', '30%', '44%'],
                    rows: [
                        ['<code>EXTRACTION_PLUGIN</code>', '<code>html-scraper</code>', '<code>pdf-report</code> switches skill data to the PDF report.'],
                        ['<code>PDF_SOURCE</code>', '<code>local</code>', 'Automatic pickup: <code>local</code>, <code>gcs</code> or <code>upload</code> (none). Uploads always work.'],
                        ['<code>PDF_LOCAL_PATH</code>', '<code>./storage/extraction/OSM-Status-6-months.pdf</code>', 'File watched when <code>PDF_SOURCE=local</code>.'],
                        ['<code>PDF_GCS_BUCKET</code>', 'value of <code>GCS_BUCKET_NAME</code>', 'Bucket watched when <code>PDF_SOURCE=gcs</code> (Cloud Run service account credentials).'],
                        ['<code>PDF_GCS_OBJECT</code>', '<code>OSM-Status-6-months.pdf</code>', 'Object name in the bucket — overwrite it with each new report.'],
                        ['<code>PDF_MAX_SIZE_MB</code>', '<code>10</code>', 'Largest report accepted.'],
                        ['<code>PDF_STALE_WARN_DAYS</code>', '<code>35</code>', 'Report age at which it is flagged Out of date.'],
                        ['<code>SCRAPING_INTERVAL</code>', '<code>60</code> (minutes)', 'Existing setting: how long extracted data is cached, i.e. how often the automatic source is checked.'],
                    ],
                }),
                h3('Recommended settings per environment'),
                table({
                    headers: ['Environment', 'Settings', 'How reports arrive'],
                    widths: ['18%', '42%', '40%'],
                    rows: [
                        ['DEV (local)', '<code>EXTRACTION_PLUGIN=pdf-report</code>, <code>PDF_SOURCE=local</code>', 'Copy the file into <code>storage/extraction/</code>, or upload.'],
                        ['TST (Raspberry Pi)', '<code>EXTRACTION_PLUGIN=pdf-report</code>, <code>PDF_SOURCE=upload</code>', 'n8n posts the email attachment to the upload API with an admin API key.'],
                        ['UAT / PROD (Cloud Run)', '<code>EXTRACTION_PLUGIN=pdf-report</code>, <code>PDF_SOURCE=gcs</code>, <code>PDF_GCS_BUCKET</code> if not <code>GCS_BUCKET_NAME</code>', 'n8n writes the attachment to the bucket; the service account needs read access to the object.'],
                        ['DEMO', 'Keep <code>html-scraper</code>', 'The PDF plugin refuses to run in demo mode — the real report must never reach the public demo.'],
                    ],
                }),
            ],
            pageBreakBefore: true,
        }),

        // ── 8. API ────────────────────────────────────────────────────────
        section({
            kicker: '8',
            heading: 'API reference',
            paragraphs: ['All endpoints require an administrator session or an admin <code>X-API-Key</code>; changes are disabled in demo mode. Full details are in the OpenAPI documentation (<code>/api/docs</code>) and the Postman collection.'],
            blocks: [
                table({
                    headers: ['Method', 'Path', 'What it does'],
                    widths: ['10%', '38%', '52%'],
                    rows: [
                        ['GET', '<code>/api/extraction/status</code>', 'Active plugin, source, current report, age/staleness, last automatic check.'],
                        ['GET', '<code>/api/extraction/snapshots</code>', 'Report history, newest first.'],
                        ['GET', '<code>/api/extraction/snapshots/{id}/file</code>', 'Download the original PDF.'],
                        ['POST', '<code>/api/extraction/upload</code>', 'Upload a report (<code>file</code>, optional <code>force=true</code>). 400 unreadable, 409 older, 413 too large.'],
                        ['POST', '<code>/api/extraction/sync</code>', 'Check the GCS object or local file now.'],
                        ['DELETE', '<code>/api/extraction/snapshots/{id}</code>', 'Delete a report from the history.'],
                        ['GET', '<code>/api/extraction/name-matches</code>', 'How each report name is matched, with possible members.'],
                        ['POST', '<code>/api/extraction/name-matches</code>', 'Link a report name to a member (<code>sourceName</code>, <code>memberId</code>).'],
                        ['DELETE', '<code>/api/extraction/name-matches/{id}</code>', 'Remove a name match.'],
                    ],
                }),
                '<p>Existing responses gained fields: report data carries <code>dueLabel</code> and <code>meta.sourceWindowMonths</code> / <code>meta.unmatchedNames</code>; the compliance matrix has the status <code>not-listed</code>; <code>/ui-config</code> has <code>extractionWindowMonths</code>.</p>',
                h3('Example — upload from an automation'),
                '<pre class="doc-code">curl -H "X-API-Key: osm_…" -F "file=@OSM-Status-6-months.pdf" https://&lt;server&gt;/api/extraction/upload\n→ {"success":true,"status":"imported","id":12,"reportCreatedDate":"2026-10-05",…}</pre>',
            ],
            pageBreakBefore: true,
        }),

        // ── 9. Data & security ────────────────────────────────────────────
        section({
            kicker: '9',
            heading: 'Data, security and confidentiality',
            blocks: [
                h3('Stored data'),
                list([
                    '<strong>Report history</strong> (migration 029): each accepted report with its original PDF, parsed entries, counts, parser warnings, source and who imported it. The PDF is stored as text so the existing database-only backup can carry it — it is included in backups and restored with them.',
                    '<strong>Name matches</strong> (migration 030): report name → member, automatic or manual. Deleting a member removes its matches.',
                    'Both migrations apply automatically at start-up.',
                ]),
                h3('Security'),
                list([
                    'Reports reach OpReady from an email inbox, so a crafted PDF is a realistic threat. The PDF library (pdf.js) runs with script evaluation disabled (the CVE-2024-4367 class of attack), files are checked for a PDF header and size before they are opened, and documents over 200 pages are refused. An older PDF library that could not disable code evaluation was rejected during design for this reason.',
                    'Every endpoint is administrator-only; uploads from a browser are protected by the existing CSRF check, automations use API keys.',
                    'Every upload, import, refusal and deletion, and every name match, is recorded in the Event Log.',
                ]),
                h3('Event Log entries'),
                table({
                    headers: ['Category', 'Title', 'When'],
                    widths: ['14%', '38%', '48%'],
                    rows: [
                        ['System', 'Skills Report Uploaded', 'A report was uploaded and accepted.'],
                        ['System', 'Skills Report Imported', 'A report was picked up from GCS or the local file.'],
                        ['System', 'Skills Report Rejected', 'An automatically found file could not be accepted.'],
                        ['System', 'Skills Report Deleted', 'A report was removed from the history.'],
                        ['Member', 'Member Name Matched Automatically', 'OpReady linked a report name (actor System).'],
                        ['Member', 'Member Name Matched / Match Removed', 'An administrator linked or unlinked a name.'],
                    ],
                }),
                h3('Confidentiality'),
                list([
                    'The real report is confidential to FENZ. It is excluded from the code repository, never used as a test fixture (tests use an anonymised copy of its text layout with fictional names), and never shown in these documents.',
                    'The PDF plugin refuses to run in demo mode, so the public DEMO instance can never display real member data.',
                ]),
            ],
            pageBreakBefore: true,
        }),

        // ── 10. Limitations ───────────────────────────────────────────────
        section({
            kicker: '10',
            heading: 'Limitations and things to know',
            blocks: [list([
                '<strong>Six months ahead only.</strong> A skill that is not in the report is either current for more than six months or not held at all — the report cannot tell which. The matrix shows such skills as "6m+" and its key says exactly that.',
                '<strong>Month precision.</strong> Due dates are derived from the month (section 2). Urgency is therefore approximate within a month; the orange highlighting is used to make the next month as precise as the report allows.',
                '<strong>Names, not identifiers.</strong> Matching relies on surname and first initial. Nicknames ("Bob" for Robert), name changes and two people with the same surname and initial need an administrator — once.',
                '<strong>No rank in the report.</strong> Ranks stay as they are in OpReady; new members must be created in Manage Members.',
                '<strong>Skills must be configured.</strong> A skill in the report that is not configured (or is disabled) in Manage Skills is ignored, as before.',
                '<strong>Data is as fresh as the last report.</strong> The dashboard shows the report date and the Skills Data Source page flags reports older than 35 days.',
                '<strong>Cloud Storage pickup</strong> has been verified with automated tests but not yet against a real bucket — the test plan covers it on UAT.',
            ])],
        }),

        // ── 11. Build & verification ──────────────────────────────────────
        section({
            kicker: '11',
            heading: 'How it was built and verified',
            paragraphs: ['The work was done on the <code>ETL-PDF-plugin</code> branch in phases, each reviewed before the next:'],
            blocks: [
                table({
                    headers: ['Phase', 'Scope'],
                    widths: ['22%', '78%'],
                    rows: [
                        ['0 — Spike', 'Proved the real report can be read reliably (positions, orange colour, bold category bands); chose the safer PDF library.'],
                        ['1 — Reader', 'PDF text extraction, grid parser with the due-date rules, the plugin, anonymised test fixture.'],
                        ['2 — Ingestion', 'Report history (migration 029), upload / GCS / local pickup, the Skills Data Source page, API, documentation.'],
                        ['3 — Name matching', 'Saved matches (migration 030), automatic matching, the matching screen, first-name and skill-name handling.'],
                        ['4 — Presentation', 'Month labels everywhere, six-month window in the matrix and reports, dashboard notes.'],
                        ['Follow-ups', 'Unmatched-name warnings (dashboard, reports, statistics), report date on the dashboard, fictional sample report generator, these documents.'],
                    ],
                }),
                h3('Verification'),
                list([
                    `<strong>Automated tests:</strong> the full Jest suite (over 800 tests) passes, including new suites for the PDF reader, parser, ingestion, routes, database modules, name matching and report changes; all 41 UI smoke tests pass.`,
                    '<strong>Real report:</strong> the actual FENZ report was read to 249 entries, 15 people and 32 skills with no parser warnings, and checked by hand against the PDF.',
                    `<strong>Fictional sample:</strong> the sample generator's report (${esc(String(sample.entryCount || '—'))} entries, ${esc(String((sample.names || []).length || '—'))} people) is read back through the same parser every time it is generated. Generating it exposed one real weakness — some PDF generators split words at kerning pairs ("Darth V" + "ader"); the reader now rejoins them, and the real report still reads identically.`,
                    '<strong>In the browser:</strong> every screen in this document was captured from a real OpReady instance running the plugin with the sample report and fictional members.',
                ]),
            ],
            pageBreakBefore: true,
        }),

        // ── 12. Next steps ────────────────────────────────────────────────
        section({
            kicker: '12',
            heading: 'Next steps',
            blocks: [list([
                'Commit the remaining work on <code>ETL-PDF-plugin</code> and deploy it to <strong>TST</strong> with <code>EXTRACTION_PLUGIN=pdf-report</code> and <code>PDF_SOURCE=upload</code>.',
                'Set up the n8n workflow: report email → <code>POST /api/extraction/upload</code> (TST) and → Cloud Storage object (UAT/PROD).',
                'Run the companion <strong>Test Plan</strong> on TST, then on UAT (including Cloud Storage pickup).',
                'After sign-off, merge to <code>main</code> and switch PROD when the OI dashboard is retired — switching back stays a one-line change.',
            ])],
        }),
    ];

    return wrapDocument(body.join('\n'));
}

module.exports = { buildReportHtml };
