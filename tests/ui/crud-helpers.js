const { expect } = require('@playwright/test');

// networkidle timeout is expected on pages with persistent Socket.IO connections
async function goTo(page, url) {
  await page.goto(url);
  try {
    await page.waitForLoadState('networkidle', { timeout: 3000 });
  } catch {
    // Expected — Socket.IO polling keeps the network active
  }
}

// Sets rows-per-page to "all" so all table rows are in the DOM before locating rows by name
async function showAllRows(page, selectId = '#rowsPerPage') {
  const sel = page.locator(selectId);
  if (await sel.count() > 0) {
    await sel.selectOption('all');
    // Client-side re-render — wait briefly for the DOM to update
    await page.waitForTimeout(400);
  }
}

// Caller must trigger the confirm modal (e.g. click a delete button) before calling this
async function confirmDialog(page) {
  await page.locator('#btnConfirmYes').waitFor({ state: 'visible' });
  await page.locator('#btnConfirmYes').click();
}

// Must be set up BEFORE the action that triggers the request
function waitForAPI(page, urlPart, method) {
  return page.waitForResponse(
    r => r.url().includes(urlPart) && r.request().method() === method,
    { timeout: 10000 }
  );
}

// Returns true when the test server is running in demo mode (mutations blocked)
async function checkDemoMode(request) {
  try {
    const res = await request.get('/ui-config');
    const cfg = await res.json();
    return cfg.appMode === 'demo';
  } catch {
    return false;
  }
}

module.exports = { goTo, showAllRows, confirmDialog, waitForAPI, checkDemoMode };
