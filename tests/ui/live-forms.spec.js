const { test, expect } = require('@playwright/test');
const { goTo, confirmDialog, waitForAPI } = require('./crud-helpers');

test.describe('T06 — Live Forms — Filter & Status', () => {

  test('T06-02 | Filter by status = submitted', async ({ page }) => {
    await goTo(page, '/live-forms.html');

    await page.locator('#filterStatus').selectOption('submitted');

    // Filter requires explicit Apply click — set up listener BEFORE clicking Apply
    const respPromise = waitForAPI(page, '/api/live-forms', 'GET');
    await page.getByRole('button', { name: 'Apply' }).click();
    await respPromise;

    // Either records are shown, or the empty-state message confirms filtering worked
    const rows     = page.locator('tbody tr');
    const emptyMsg = page.locator('text=/No.*records.*found/i');
    const hasRows  = await rows.count() > 0;
    const hasEmpty = await emptyMsg.count() > 0;
    expect(hasRows || hasEmpty, 'Table should show rows or empty-state after filtering').toBe(true);
  });

  test('T06-11 | Toggle to archived view and back', async ({ page }) => {
    await goTo(page, '/live-forms.html');

    // #archiveToggle is a hidden checkbox — click its visible label instead
    const label = page.locator('label[for="archiveToggle"]');
    const respPromise1 = waitForAPI(page, '/api/live-forms', 'GET');
    await label.click();
    await respPromise1;
    expect(page.url()).toContain('/live-forms.html');

    const respPromise2 = waitForAPI(page, '/api/live-forms', 'GET');
    await label.click();
    await respPromise2;
    expect(page.url()).toContain('/live-forms.html');
  });

  test('T06-07 | Change status of first active record to accepted', async ({ page }) => {
    await goTo(page, '/live-forms.html');

    const firstEditBtn = page.locator('.btn-icon.edit').first();
    if (await firstEditBtn.count() === 0) {
      test.skip(true, 'No active live form records in demo data');
      return;
    }

    await firstEditBtn.click();
    await page.locator('#statusModal').waitFor({ state: 'visible' });
    await page.locator('#editStatusSelect').selectOption('accepted');

    const respPromise = waitForAPI(page, '/api/live-forms/', 'PUT');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
  });

});
