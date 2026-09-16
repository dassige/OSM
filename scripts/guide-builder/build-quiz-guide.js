/**
 * Builds the full "Quiz Games — Administrator and Player/Team Guide" PDF.
 *
 * Usage:
 *   npm run guide:quiz
 *   node scripts/guide-builder/build-quiz-guide.js
 *
 * What it does:
 *   1. Copies the local demo.db to a scratch file and seeds the two example
 *      quiz games into it if not already present (never touches the real
 *      demo.db or fenz.db).
 *   2. Starts a disposable server.js instance (APP_MODE=development, so the
 *      demo-mode guard never blocks Start Single/Teams or live hosting)
 *      pointed at that scratch DB, on a dedicated local port.
 *   3. Drives the real UI with Playwright — as an admin and as two mobile
 *      players/teams — through the full Quiz Games lifecycle, saving a
 *      screenshot at each step.
 *   4. Renders those screenshots plus written guide content into a single
 *      PDF at docs/guides/OpReady-Quiz-Feature-Guide.pdf.
 *   5. Shuts down the scratch server and deletes the scratch DB.
 *
 * See scripts/guide-builder/lib/ for the reusable pieces (server bootstrap,
 * DB preparation, HTML/branding helpers, PDF rendering) — a future guide for
 * another feature should reuse these rather than duplicating them. See also
 * .claude/skills/pdf-guide-builder/SKILL.md.
 */

const path = require('path');
const packageJson = require('../../package.json');
const { prepareCaptureDb, cleanupCaptureDb } = require('./lib/prepare-db');
const { startCaptureServer } = require('./lib/demo-server');
const { renderPdf } = require('./lib/pdf-renderer');
const { captureQuizScreenshots } = require('./quiz/capture');
const { buildQuizGuideHtml } = require('./quiz/content');

const PORT = parseInt(process.env.GUIDE_BUILDER_PORT || '3098', 10);
const USERNAME = 'guideadmin';
const PASSWORD = 'GuideBuilder#Screenshots2026';
const OUT_DIR = path.join(__dirname, 'output', 'quiz');
const SCREENSHOTS_DIR = path.join(OUT_DIR, 'screenshots');
const PDF_PATH = path.join(__dirname, '..', '..', 'docs', 'guides', 'OpReady-Quiz-Feature-Guide.pdf');

async function main() {
  console.log('[guide:quiz] Preparing scratch database...');
  const dbPath = await prepareCaptureDb(OUT_DIR);

  console.log('[guide:quiz] Starting scratch server...');
  const server = await startCaptureServer({ port: PORT, dbPath, username: USERNAME, password: PASSWORD });

  let manifest;
  try {
    console.log('[guide:quiz] Capturing screenshots (this drives a real quiz round end to end)...');
    manifest = await captureQuizScreenshots({
      baseUrl: server.baseUrl,
      username: USERNAME,
      password: PASSWORD,
      outDir: SCREENSHOTS_DIR,
    });
  } finally {
    console.log('[guide:quiz] Stopping scratch server...');
    await server.stop();
    cleanupCaptureDb(dbPath);
  }

  console.log('[guide:quiz] Rendering PDF...');
  const html = buildQuizGuideHtml({
    manifest,
    appVersion: packageJson.version,
    generatedDate: new Date().toISOString().slice(0, 10),
  });
  await renderPdf({ html, outputPath: PDF_PATH, title: 'OpReady Quiz Games Guide' });

  console.log(`[guide:quiz] Done. PDF written to ${PDF_PATH}`);
}

main().catch((e) => {
  console.error('[guide:quiz] FAILED:', e);
  process.exit(1);
});
