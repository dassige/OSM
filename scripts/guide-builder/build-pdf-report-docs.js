/**
 * Builds the two pdf-report plugin documents:
 *   docs/guides/OpReady-PDF-Report-Plugin-Report.pdf     — what was built and how the app behaves
 *   docs/guides/OpReady-PDF-Report-Plugin-Test-Plan.pdf  — how to test it on TST / UAT
 *
 * Usage:
 *   npm run guide:pdf-report
 *   node scripts/guide-builder/build-pdf-report-docs.js
 *
 * What it does:
 *   1. Copies the local demo.db to a scratch file and seeds one extra member so a
 *      report name is ambiguous (never touches the real demo.db or fenz.db).
 *   2. Generates two FICTIONAL "Skills Expiring in the Next Six Months" PDFs
 *      (sample-report.js) — dated today and one month earlier — so no confidential
 *      report is ever used.
 *   3. Starts a disposable server.js (APP_MODE=development, EXTRACTION_PLUGIN=pdf-report,
 *      PDF_SOURCE=upload) on the scratch DB and drives the real UI with Playwright.
 *   4. Renders both documents. The test plan's test cases are read from
 *      UAT-TESTING-PLAN.csv, so it always matches the UAT plan.
 *   5. Stops the server and deletes the scratch DB.
 */

'use strict';

const path = require('path');
const sqlite3 = require('sqlite3');
const packageJson = require('../../package.json');
const { prepareCaptureDb, cleanupCaptureDb } = require('./lib/prepare-db');
const { startCaptureServer } = require('./lib/demo-server');
const { renderPdf } = require('./lib/pdf-renderer');
const { buildSampleReport, renderPdfPagePng } = require('./pdf-report/sample-report');
const { capturePdfReportScreenshots } = require('./pdf-report/capture');

const PORT = parseInt(process.env.GUIDE_BUILDER_PORT || '3098', 10);
const USERNAME = 'guideadmin';
const PASSWORD = 'GuideBuilder#Screenshots2026';
const OUT_DIR = path.join(__dirname, 'output', 'pdf-report');
const SCREENSHOTS_DIR = path.join(OUT_DIR, 'screenshots');
const DOCS_DIR = path.join(__dirname, '..', '..', 'docs', 'guides');
const REPORT_PDF = path.join(DOCS_DIR, 'OpReady-PDF-Report-Plugin-Report.pdf');
const TEST_PLAN_PDF = path.join(DOCS_DIR, 'OpReady-PDF-Report-Plugin-Test-Plan.pdf');

// Local calendar date (not UTC — in NZ the UTC date is a day behind every morning).
const isoDate = (d) => d.toLocaleDateString('en-CA');

/** Scratch DB only: start from no reports/matches and add a second "Fett, B" (ambiguous name). */
async function seedScratchDb(dbPath) {
    if (!dbPath.includes('opready-guide-builder')) throw new Error(`Refusing to seed a non-scratch database: ${dbPath}`);
    const db = new sqlite3.Database(dbPath);
    const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
    try {
        await run('DELETE FROM member_source_aliases').catch(() => {});
        await run('DELETE FROM extraction_snapshots').catch(() => {});
        await run(`INSERT INTO members (name, email, mobile, enabled, notificationPreference, rank, first_name, last_name)
                   SELECT 'SFF Fett, B', '', '', 1, 'email', 'SFF', 'B', 'Fett'
                   WHERE NOT EXISTS (SELECT 1 FROM members WHERE name = 'SFF Fett, B')`);
    } finally {
        await new Promise((resolve) => db.close(resolve));
    }
}

async function main() {
    const today = new Date();
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

    console.log('[guide:pdf-report] Generating fictional sample reports...');
    const sample = await buildSampleReport({ outputPath: path.join(OUT_DIR, 'Sample-Skills-Report.pdf'), createdDate: isoDate(today) });
    const older = await buildSampleReport({ outputPath: path.join(OUT_DIR, 'Sample-Skills-Report-older.pdf'), createdDate: isoDate(monthAgo) });
    const samplePng = await renderPdfPagePng(sample.outputPath, path.join(SCREENSHOTS_DIR, 'sample-report.png'));

    console.log('[guide:pdf-report] Preparing scratch database...');
    const dbPath = await prepareCaptureDb(OUT_DIR);
    await seedScratchDb(dbPath);

    console.log('[guide:pdf-report] Starting scratch server (pdf-report plugin)...');
    const server = await startCaptureServer({
        port: PORT, dbPath, username: USERNAME, password: PASSWORD,
        extraEnv: { EXTRACTION_PLUGIN: 'pdf-report', PDF_SOURCE: 'upload', SCRAPING_INTERVAL: '1' },
    });

    let manifest;
    try {
        console.log('[guide:pdf-report] Capturing screenshots...');
        manifest = await capturePdfReportScreenshots({
            baseUrl: server.baseUrl, username: USERNAME, password: PASSWORD, outDir: SCREENSHOTS_DIR,
            samplePdf: sample.outputPath, olderSamplePdf: older.outputPath,
        });
    } finally {
        console.log('[guide:pdf-report] Stopping scratch server...');
        await server.stop();
        cleanupCaptureDb(dbPath);
    }
    manifest.shots['sample-report'] = samplePng;
    manifest.data.sample = sample;
    console.log(`[guide:pdf-report] ${Object.keys(manifest.shots).length} screenshots captured.`);

    if (process.argv.includes('--capture-only')) return;

    const generatedDate = isoDate(today);
    const { buildReportHtml } = require('./pdf-report/content-report');
    const { buildTestPlanHtml } = require('./pdf-report/content-test-plan');

    console.log('[guide:pdf-report] Rendering implementation report...');
    await renderPdf({
        html: buildReportHtml({ manifest, appVersion: packageJson.version, generatedDate }),
        outputPath: REPORT_PDF,
        title: 'OpReady — PDF Skills Report Plugin: Implementation Report',
    });
    console.log('[guide:pdf-report] Rendering test plan...');
    await renderPdf({
        html: buildTestPlanHtml({ manifest, appVersion: packageJson.version, generatedDate }),
        outputPath: TEST_PLAN_PDF,
        title: 'OpReady — PDF Skills Report Plugin: Test Plan',
    });
    console.log(`[guide:pdf-report] Done.\n  ${REPORT_PDF}\n  ${TEST_PLAN_PDF}`);
}

main().catch((e) => {
    console.error('[guide:pdf-report] FAILED:', e);
    process.exit(1);
});
