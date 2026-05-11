const { expect } = require('@playwright/test');

/**
 * Navigate to a URL and wait for the page to settle.
 * A networkidle timeout is expected on pages with persistent Socket.IO connections.
 */
async function goTo(page, url) {
  await page.goto(url);
  try {
    await page.waitForLoadState('networkidle', { timeout: 3000 });
  } catch {
    // Expected — Socket.IO polling keeps the network active
  }
}

/**
 * If the page has a rows-per-page selector, set it to "all" so all table rows
 * are rendered in the DOM. Necessary before locating rows by name.
 */
async function showAllRows(page, selectId = '#rowsPerPage') {
  const sel = page.locator(selectId);
  if (await sel.count() > 0) {
    await sel.selectOption('all');
    // Client-side re-render — wait briefly for the DOM to update
    await page.waitForTimeout(400);
  }
}

/**
 * Click the "Yes" button in the shared custom confirm modal.
 * The caller is responsible for waiting for the confirm modal to appear first
 * (e.g. by clicking a delete button that triggers it).
 */
async function confirmDialog(page) {
  await page.locator('#btnConfirmYes').waitFor({ state: 'visible' });
  await page.locator('#btnConfirmYes').click();
}

/**
 * Wait for a fetch response matching urlPart and HTTP method.
 * Must be set up BEFORE the action that triggers the request.
 */
function waitForAPI(page, urlPart, method) {
  return page.waitForResponse(
    r => r.url().includes(urlPart) && r.request().method() === method,
    { timeout: 10000 }
  );
}

module.exports = { goTo, showAllRows, confirmDialog, waitForAPI };
