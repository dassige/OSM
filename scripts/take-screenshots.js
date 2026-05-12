/**
 * Standalone Playwright screenshot script.
 * Launches headless Chromium, logs in as demo/demo, visits every page,
 * and saves full-page PNGs to ./screenshots/<page-name>.png
 *
 * Usage:
 *   node scripts/take-screenshots.js
 *
 * Options (env vars):
 *   BASE_URL      — default http://localhost:3000
 *   SCREENSHOT_USER — default demo
 *   SCREENSHOT_PASS — default demo
 *   OUT_DIR       — default screenshots
 *   VIEWPORT_W    — default 1440
 *   VIEWPORT_H    — default 900
 *   FULL_PAGE     — default true  (set to false for viewport-only)
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL   = process.env.BASE_URL        || 'http://localhost:3000';
const USERNAME   = process.env.SCREENSHOT_USER || 'demo';
const PASSWORD   = process.env.SCREENSHOT_PASS || 'demo';
const OUT_DIR    = process.env.OUT_DIR    || 'screenshots';
const VIEWPORT_W = parseInt(process.env.VIEWPORT_W || '1440', 10);
const VIEWPORT_H = parseInt(process.env.VIEWPORT_H || '900',  10);
const FULL_PAGE  = process.env.FULL_PAGE !== 'false';

const PAGES = [
  { url: '/          ',            name: '00-main',            auth: true },
  { url: '/login.html',            name: 'AA-login',            auth: false },
  { url: '/members.html',          name: '01-members',          auth: true  },
  { url: '/skills.html',           name: '02-skills',           auth: true  },
  { url: '/forms-manage.html',     name: '03-forms-manage',     auth: true  },
  { url: '/live-forms.html',       name: '04-live-forms',       auth: true  },
  { url: '/live-surveys.html',     name: '05-live-surveys',     auth: true  },
  { url: '/surveys-manage.html',   name: '06-surveys-manage',   auth: true  },
  { url: '/surveys-results.html',  name: '07-surveys-results',  auth: true  },
  { url: '/surveys-tracking.html', name: '08-surveys-tracking', auth: true  },
  { url: '/reports.html',          name: '09-reports',          auth: true  },
  { url: '/statistics.html',       name: '10-statistics',       auth: true  },
  { url: '/training-planner.html', name: '11-training-planner', auth: true  },
  { url: '/event-log.html',        name: '12-event-log',        auth: true  },
  { url: '/templates.html',        name: '13-templates',        auth: true  },
  { url: '/third-parties.html',    name: '14-third-parties',    auth: true  },
  { url: '/users.html',            name: '15-users',            auth: true  },
  { url: '/system-tools.html',     name: '16-system-tools',     auth: true  },
  { url: '/profile.html',          name: '17-profile',          auth: true  },
];

async function waitForContent(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 3000 });
  } catch {
    // Socket.IO keeps the network active — domcontentloaded is sufficient
  }
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // --- authenticated context (logged-in session) ---
  const authContext = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
  });

  const loginPage = await authContext.newPage();
  console.log(`Logging in as ${USERNAME} on ${BASE_URL} …`);
  const resp = await authContext.request.post(`${BASE_URL}/login`, {
    data: { username: USERNAME, password: PASSWORD },
  });
  if (!resp.ok()) {
    console.error(`Login failed: HTTP ${resp.status()}`);
    await browser.close();
    process.exit(1);
  }
  const body = await resp.json();
  if (!body.success) {
    console.error(`Login rejected: ${JSON.stringify(body)}`);
    await browser.close();
    process.exit(1);
  }
  await loginPage.close();

  // --- unauthenticated context (for login page) ---
  const anonContext = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
  });

  let passed = 0;
  let failed = 0;

  for (const { url, name, auth } of PAGES) {
    const ctx  = auth ? authContext : anonContext;
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE_URL}${url}`);
      await waitForContent(page);

      // Extra settle time for data-heavy pages (charts, tables)
      await page.waitForTimeout(800);

      const file = path.join(OUT_DIR, `${name}.png`);
      await page.screenshot({ path: file, fullPage: FULL_PAGE });
      console.log(`  ✓  ${name}.png`);
      passed++;
    } catch (e) {
      console.error(`  ✗  ${name} — ${e.message}`);
      failed++;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\nDone. ${passed} screenshots saved to ./${OUT_DIR}/  (${failed} failed)`);
  if (failed > 0) process.exit(1);
})();
