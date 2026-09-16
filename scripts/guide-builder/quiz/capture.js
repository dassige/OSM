/**
 * Drives a real OpReady instance (see build-quiz-guide.js for how the server
 * is started) through the full Quiz Games lifecycle with Playwright, saving
 * a screenshot at each step used by the PDF guide. All member/team names
 * come from the local demo.db fixture (fictional Star Wars names) — this
 * script never touches real member data.
 *
 * Admin screens are captured at desktop viewport; player/team screens are
 * captured on an emulated iPhone 13, since the quiz-play experience is
 * mobile-first for real users following an SMS/email link on their phone.
 */

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('@playwright/test');

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

function log(msg) {
  console.log(`  [capture] ${msg}`);
}

async function shot(page, outDir, name, opts = {}) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage !== false });
  log(`saved ${name}.png`);
  return file;
}

async function safe(label, fn) {
  try {
    await fn();
  } catch (e) {
    log(`WARNING — step "${label}" failed, continuing: ${e.message}`);
  }
}

async function login(context, baseUrl, username, password) {
  const res = await context.request.post(`${baseUrl}/login`, { data: { username, password } });
  if (!res.ok()) throw new Error(`Login failed: HTTP ${res.status()}`);
  const body = await res.json();
  if (!body.success) throw new Error(`Login rejected: ${JSON.stringify(body)}`);
}

/** Moves a team-pool member chip (matched by visible text) into a team column via DOM, bypassing Sortable.js drag simulation — the submit handler reads plain DOM order, so this is behaviourally identical to a real drag. */
async function assignMemberToTeam(page, memberText, columnIndex) {
  await page.evaluate(({ memberText, columnIndex }) => {
    const pool = document.getElementById('teamPool');
    const chip = Array.from(pool.querySelectorAll('.team-member-chip')).find((c) => c.textContent.includes(memberText));
    if (!chip) throw new Error(`Member chip containing "${memberText}" not found in pool`);
    const columns = document.querySelectorAll('#teamColumnsContainer .team-column .team-member-list');
    const target = columns[columnIndex];
    if (!target) throw new Error(`Team column ${columnIndex} not found`);
    target.appendChild(chip);
    if (typeof updateTeamCounts === 'function') updateTeamCounts();
  }, { memberText, columnIndex });
}

async function captureQuizScreenshots({ baseUrl, username, password, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = { shots: {} };
  const record = (key, file) => { manifest.shots[key] = file; };

  const browser = await chromium.launch();
  try {
    const adminCtx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    await login(adminCtx, baseUrl, username, password);
    const admin = await adminCtx.newPage();

    // ── Part 1: Quiz Games manager ──────────────────────────────────────
    log('Quiz Games manager');
    await admin.goto(`${baseUrl}/quiz-games.html`);
    await admin.waitForSelector('.form-item');
    await admin.waitForTimeout(400);
    record('p1-01-quiz-games-list', await shot(admin, outDir, 'p1-01-quiz-games-list'));

    await admin.click('.form-item:has-text("Chainsaw Operation")');
    await admin.waitForSelector('#questionsCanvas .field-card');
    await admin.waitForTimeout(300);
    record('p1-02-quiz-builder-timed', await shot(admin, outDir, 'p1-02-quiz-builder-timed'));

    await admin.click('.form-item:has-text("Working at Height")');
    await admin.waitForSelector('#questionsCanvas .field-card');
    await admin.waitForTimeout(300);
    record('p1-03-quiz-builder-score', await shot(admin, outDir, 'p1-03-quiz-builder-score'));

    await safe('quiz preview popup', async () => {
      const [previewPage] = await Promise.all([
        adminCtx.waitForEvent('page'),
        admin.click('#btnPreview'),
      ]);
      await previewPage.waitForLoadState('domcontentloaded');
      await previewPage.waitForTimeout(600);
      record('p1-04-quiz-preview', await shot(previewPage, outDir, 'p1-04-quiz-preview'));
      await previewPage.close();
    });

    // ── Start Single (Score game) ───────────────────────────────────────
    log('Start Single session (Working at Height)');
    await admin.click('#btnStartSession');
    await admin.waitForSelector('#sessionModal.modal[style*="display: block"], #sessionModal.modal[style*="display:block"]');
    await admin.waitForTimeout(300);
    record('p1-05-start-single-modal', await shot(admin, outDir, 'p1-05-start-single-modal', { fullPage: false }));

    await admin.uncheck('#sessionSendEmails');
    const [singleSessionResp] = await Promise.all([
      admin.waitForResponse((r) => r.url().includes('/api/live-quiz/sessions') && r.request().method() === 'POST'),
      admin.click('#btnConfirmSession'),
    ]);
    const singleSession = await singleSessionResp.json();
    log(`single session created: id=${singleSession.sessionId}, players=${singleSession.players.length}`);
    await admin.waitForTimeout(500);

    // ── Start Teams (Timed game) ────────────────────────────────────────
    log('Start Teams session (Chainsaw Operation)');
    await admin.click('.form-item:has-text("Chainsaw Operation")');
    await admin.waitForSelector('#questionsCanvas .field-card');
    // loadEditor() snapshots originalGameState on a 300ms deferred timer (to
    // let the DOM settle first) — isGameDirty() would otherwise false-positive
    // against the *previous* game's snapshot and silently block this click.
    await admin.waitForTimeout(600);
    await admin.click('#btnSetupTeams');
    await admin.waitForSelector('#teamSetupModal.modal[style*="display: block"], #teamSetupModal.modal[style*="display:block"]');
    await admin.waitForSelector('#teamPool .team-member-chip');

    await admin.fill('#teamColumnsContainer .team-column:nth-child(1) .team-name-input', 'Team Jedi');
    await admin.fill('#teamColumnsContainer .team-column:nth-child(2) .team-name-input', 'Team Sith');
    await assignMemberToTeam(admin, 'Skywalker', 0);
    await assignMemberToTeam(admin, 'Organa', 0);
    await assignMemberToTeam(admin, 'Vader', 1);
    await assignMemberToTeam(admin, 'Palpatine', 1);
    await admin.waitForTimeout(300);
    record('p1-06-start-teams-modal', await shot(admin, outDir, 'p1-06-start-teams-modal', { fullPage: false }));

    const [teamSessionResp] = await Promise.all([
      admin.waitForResponse((r) => r.url().includes('/api/live-quiz/team-sessions') && r.request().method() === 'POST'),
      admin.click('#btnConfirmTeamSetup'),
    ]);
    const teamSession = await teamSessionResp.json();
    log(`team session created: id=${teamSession.teamSessionId}, teams=${teamSession.teams.map((t) => t.name).join(', ')}`);
    await admin.waitForTimeout(500);

    const team1 = teamSession.teams.find((t) => t.name === 'Team Jedi');
    const team2 = teamSession.teams.find((t) => t.name === 'Team Sith');

    // ── Live Quiz management page ────────────────────────────────────────
    log('Live Quiz management page');
    await admin.goto(`${baseUrl}/live-quiz.html`);
    await admin.waitForSelector('#sessionsTableBody tr');
    await admin.waitForTimeout(300);
    record('p1-07-live-quiz-single-list', await shot(admin, outDir, 'p1-07-live-quiz-single-list'));

    await safe('quiz leaderboard popup', async () => {
      const [lbPage] = await Promise.all([
        adminCtx.waitForEvent('page'),
        admin.click('#sessionsTableBody button:has-text("Launch")'),
      ]);
      await lbPage.waitForLoadState('domcontentloaded');
      await lbPage.waitForTimeout(600);
      record('p1-11-quiz-leaderboard-live', await shot(lbPage, outDir, 'p1-11-quiz-leaderboard-live'));
      await lbPage.close();
    });

    await admin.click('#sessionsTableBody button:has-text("Results")');
    await admin.waitForSelector('#sessionDetailView[style*="display: block"], #sessionDetailView[style*="display:block"]');
    await admin.waitForTimeout(300);
    record('p1-08-live-quiz-single-detail', await shot(admin, outDir, 'p1-08-live-quiz-single-detail'));

    await admin.click('.lq-tab-btn[data-tab="teams"]');
    await admin.waitForSelector('#teamSessionsTableBody tr');
    await admin.waitForTimeout(300);
    record('p1-09-live-quiz-teams-list', await shot(admin, outDir, 'p1-09-live-quiz-teams-list'));

    // Launch must happen from the list row (the row action is not present in
    // the detail view) — capture it before navigating into "Teams" detail.
    log('Launching host screen');
    const [hostPage1] = await Promise.all([
      adminCtx.waitForEvent('page'),
      admin.click('#teamSessionsTableBody button:has-text("Launch")'),
    ]);
    let hostPage = hostPage1;
    await hostPage.waitForLoadState('domcontentloaded');
    await hostPage.waitForSelector('.roster-list');
    await hostPage.waitForTimeout(400);
    record('p1-12-host-lobby-empty', await shot(hostPage, outDir, 'p1-12-host-lobby-empty'));

    await admin.click('#teamSessionsTableBody button:has-text("Teams")');
    await admin.waitForSelector('#teamSessionDetailView[style*="display: block"], #teamSessionDetailView[style*="display:block"]');
    await admin.waitForTimeout(300);
    record('p1-10-live-quiz-team-detail', await shot(admin, outDir, 'p1-10-live-quiz-team-detail'));

    // ── Part 2: Player / Team mobile experience ─────────────────────────
    log('Team players joining from mobile');
    const iphone = devices['iPhone 13'];
    const team1Ctx = await browser.newContext({ ...iphone });
    const team2Ctx = await browser.newContext({ ...iphone });
    const team1Page = await team1Ctx.newPage();
    const team2Page = await team2Ctx.newPage();

    await team1Page.goto(`${baseUrl}/quiz-join.html`);
    await team1Page.waitForSelector('#joinCodeInput');
    await team1Page.waitForTimeout(300);
    record('p2-01-join-page-blank', await shot(team1Page, outDir, 'p2-01-join-page-blank'));

    await team1Page.fill('#joinCodeInput', team1.accessCode);
    await Promise.all([
      team1Page.waitForURL(/quiz-play\.html\?teamCode=/),
      team1Page.click('#btnJoin'),
    ]);
    await team1Page.waitForSelector('#timedPlayContainer');
    await team1Page.waitForTimeout(500);
    record('p2-02-lobby-waiting', await shot(team1Page, outDir, 'p2-02-lobby-waiting'));

    await team2Page.goto(`${baseUrl}/quiz-join.html?code=${team2.accessCode}`);
    await team2Page.waitForURL(/quiz-play\.html\?teamCode=/);
    await team2Page.waitForSelector('#timedPlayContainer');
    await team2Page.waitForTimeout(500);

    await hostPage.reload();
    await hostPage.waitForSelector('.roster-chip.joined');
    await hostPage.waitForTimeout(500);
    record('p1-13-host-lobby-joined', await shot(hostPage, outDir, 'p1-13-host-lobby-joined'));

    // ── Host-disconnect banner (safe to demo during lobby — no live question in flight) ──
    await safe('host disconnect banner', async () => {
      await hostPage.close();
      await team1Page.waitForTimeout(700);
      record('p2-03-host-disconnected-banner', await shot(team1Page, outDir, 'p2-03-host-disconnected-banner'));
      hostPage = await adminCtx.newPage();
      await hostPage.goto(`${baseUrl}/quiz-host.html?kind=team&sessionId=${teamSession.teamSessionId}`);
      await hostPage.waitForSelector('.roster-list');
      await hostPage.waitForTimeout(400);
    });

    // ── Start the live game ──────────────────────────────────────────────
    log('Starting the live game — Question 1');
    await hostPage.click('#btnStart');
    await hostPage.waitForSelector('.host-question-text');
    await team1Page.waitForSelector('.timed-option-btn');
    await team1Page.waitForTimeout(500);
    record('p2-04-question-in-progress', await shot(team1Page, outDir, 'p2-04-question-in-progress'));

    // Chainsaw Q1 correct answer, from examples/quiz/quiz-chainsaw-operation.json:
    const CORRECT_Q1 = 'Cold start on the ground, warm start between the legs';
    const WRONG_Q1 = 'Both cold and warm start on the ground';

    await team1Page.click(`.timed-option-btn:has-text("${WRONG_Q1}")`);
    await team2Page.click(`.timed-option-btn:has-text("${CORRECT_Q1}")`);
    await hostPage.waitForTimeout(600);
    record('p1-14-host-answered-count', await shot(hostPage, outDir, 'p1-14-host-answered-count'));

    // Every state transition below runs through the host page's own apiPost()
    // helper (page.evaluate), not a bare HTTP call — the app's global fetch()
    // wrapper attaches a CSRF token that only exists inside a real page
    // context, so a raw context.request.post() to these endpoints is rejected.
    const hostApiPost = (action) => hostPage.evaluate((a) => apiPost(a), action);

    await hostApiPost('reveal');
    await hostPage.waitForSelector('#hostRevealAction button');
    await hostPage.waitForTimeout(400);
    record('p1-15-host-reveal', await shot(hostPage, outDir, 'p1-15-host-reveal'));
    await team1Page.waitForTimeout(400);
    record('p2-05-reveal-wrong', await shot(team1Page, outDir, 'p2-05-reveal-wrong'));
    record('p2-06-reveal-correct', await shot(team2Page, outDir, 'p2-06-reveal-correct'));

    await hostApiPost('show-leaderboard');
    await hostPage.waitForSelector('.host-leaderboard-row');
    await hostPage.waitForTimeout(400);
    record('p1-16-host-leaderboard-next', await shot(hostPage, outDir, 'p1-16-host-leaderboard-next'));
    await team2Page.waitForTimeout(400);
    record('p2-07-leaderboard-progress', await shot(team2Page, outDir, 'p2-07-leaderboard-progress'));

    // ── Fast-forward through the remaining questions, no screenshots ───────
    log('Fast-forwarding to the final question');
    const TOTAL_QUESTIONS = 6;
    for (let q = 1; q < TOTAL_QUESTIONS - 1; q++) {
      await hostApiPost('next');
      await hostApiPost('reveal');
      await hostApiPost('show-leaderboard');
    }
    // Advance into the last question, reveal it, then show its leaderboard —
    // this is the state where the host button reads "Finish Quiz" instead of
    // "Next Question" (the very bug this session fixed earlier).
    await hostApiPost('next');
    await hostApiPost('reveal');
    await hostApiPost('show-leaderboard');
    await hostPage.reload();
    await hostPage.waitForSelector('.host-leaderboard-row');
    await hostPage.waitForTimeout(400);
    record('p1-17-host-leaderboard-finish', await shot(hostPage, outDir, 'p1-17-host-leaderboard-finish'));

    await hostPage.click('#btnNext');
    await hostPage.waitForSelector('text=Quiz Finished!');
    await hostPage.waitForTimeout(400);
    record('p1-18-host-finished', await shot(hostPage, outDir, 'p1-18-host-finished'));

    await team2Page.waitForTimeout(500);
    record('p2-08-finished-leaderboard', await shot(team2Page, outDir, 'p2-08-finished-leaderboard'));

    await team1Ctx.close();
    await team2Ctx.close();

    // ── Score-based self-paced player flow ──────────────────────────────
    log('Score-based self-paced player flow');
    const scorePlayerCtx = await browser.newContext({ ...iphone });
    const scorePage = await scorePlayerCtx.newPage();
    const firstPlayer = singleSession.players[0];
    await scorePage.goto(`${baseUrl}/quiz-play.html?code=${firstPlayer.access_code}`);
    await scorePage.waitForSelector('#quizForm');
    await scorePage.waitForTimeout(400);
    record('p2-09-score-form', await shot(scorePage, outDir, 'p2-09-score-form'));

    await scorePage.evaluate(() => {
      document.querySelectorAll('.question-card').forEach((card) => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio) { radio.checked = true; return; }
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) { checkbox.checked = true; return; }
        const textarea = card.querySelector('textarea');
        if (textarea) textarea.value = 'Sample answer for the purposes of this guide.';
      });
    });
    await Promise.all([
      scorePage.waitForSelector('#resultBox[style*="display: block"], #resultBox[style*="display:block"]'),
      scorePage.click('.btn-submit'),
    ]);
    await scorePage.waitForTimeout(400);
    record('p2-10-score-result', await shot(scorePage, outDir, 'p2-10-score-result'));
    await scorePlayerCtx.close();

    // ── Quiz Performance report ──────────────────────────────────────────
    log('Quiz Performance report');
    await admin.goto(`${baseUrl}/reports.html`);
    await admin.waitForSelector('#reportSelect');
    await admin.selectOption('#reportSelect', 'quiz-performance');
    await admin.click('button:has-text("Run Report")');
    await admin.waitForTimeout(1200);
    record('p1-19-quiz-performance-report', await shot(admin, outDir, 'p1-19-quiz-performance-report'));

    manifest.data = {
      singleSession, teamSession, team1, team2,
      correctQ1: CORRECT_Q1, wrongQ1: WRONG_Q1,
    };
    return manifest;
  } finally {
    await browser.close();
  }
}

module.exports = { captureQuizScreenshots };
