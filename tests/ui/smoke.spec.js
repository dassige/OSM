const { test, expect } = require('@playwright/test');

// forms-view and surveys-view are included without an ID — the page shell should load without JS errors
const AUTH_PAGES = [
  { url: '/members.html',           name: 'Members' },
  { url: '/skills.html',            name: 'Skills' },
  { url: '/forms-manage.html',      name: 'Forms Manage' },
  { url: '/live-forms.html',        name: 'Live Forms' },
  { url: '/forms-view.html',        name: 'Forms View (no ID)' },
  { url: '/live-surveys.html',      name: 'Live Surveys' },
  { url: '/surveys-manage.html',    name: 'Surveys Manage' },
  { url: '/surveys-results.html',   name: 'Surveys Results' },
  { url: '/surveys-tracking.html',  name: 'Surveys Tracking' },
  { url: '/surveys-view.html',      name: 'Surveys View (no ID)' },
  { url: '/reports.html',           name: 'Reports' },
  { url: '/statistics.html',        name: 'Statistics' },
  { url: '/training-planner.html',  name: 'Training Planner' },
  { url: '/event-log.html',         name: 'Event Log' },
  { url: '/templates.html',         name: 'Templates' },
  { url: '/third-parties.html',     name: 'Third Parties' },
  { url: '/users.html',             name: 'Users' },
  { url: '/system-tools.html',      name: 'System Tools' },
  { url: '/profile.html',           name: 'Profile' },
];

function attachErrorListeners(page) {
  const errors = [];
  page.on('pageerror', err => errors.push(`[uncaught] ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  return errors;
}

// Socket.IO polling keeps the network active indefinitely, so a networkidle timeout here is expected
async function loadPage(page, url) {
  await page.goto(url);
  try {
    await page.waitForLoadState('networkidle', { timeout: 3000 });
  } catch {
    // Expected on pages with persistent Socket.IO connections
  }
}

test.describe('Smoke — authenticated pages', () => {
  for (const { url, name } of AUTH_PAGES) {
    test(`${name} loads without JS errors`, async ({ page }) => {
      const errors = attachErrorListeners(page);

      await loadPage(page, url);

      expect(page.url(), 'Page redirected to login — session may have expired').not.toContain('/login.html');
      expect(errors, `JS errors on ${name}:\n${errors.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Smoke — public pages', () => {
  test('Login page loads without JS errors', async ({ page, context }) => {
    // Clear session so we are testing the page in its unauthenticated state
    await context.clearCookies();

    const errors = attachErrorListeners(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    expect(errors, `JS errors on Login:\n${errors.join('\n')}`).toEqual([]);
  });
});
