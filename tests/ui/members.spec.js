const { test, expect } = require('@playwright/test');
const { goTo, showAllRows, confirmDialog, waitForAPI } = require('./crud-helpers');

const TS   = Date.now();
const NAME  = `UAT Member ${TS}`;
const NAME2 = `UAT Member ${TS} v2`;
const EMAIL = `uat-member-${TS}@test.nz`;

test.describe.serial('T03 — Members CRUD', () => {

  test('T03-02 | Create a new member', async ({ page }) => {
    await goTo(page, '/members.html');

    await page.getByRole('button', { name: 'Add Member' }).click();
    await page.locator('#memberModal').waitFor({ state: 'visible' });

    await page.fill('#name',   NAME);
    await page.fill('#email',  EMAIL);
    await page.fill('#mobile', '0211234567');

    const respPromise = waitForAPI(page, '/api/members', 'POST');
    await page.locator('#memberForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    await showAllRows(page);
    await expect(page.locator(`tr:has-text("${NAME}")`).first()).toBeVisible({ timeout: 5000 });
  });

  test('T03-03 | Edit member name', async ({ page }) => {
    await goTo(page, '/members.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#memberModal').waitFor({ state: 'visible' });
    await page.fill('#name', NAME2);

    const respPromise = waitForAPI(page, '/api/members/', 'PUT');
    await page.locator('#memberForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    await expect(page.locator(`tr:has-text("${NAME2}")`).first()).toBeVisible({ timeout: 5000 });
  });

  test('T03-05 | Edit notification preference', async ({ page }) => {
    await goTo(page, '/members.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME2}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#memberModal').waitFor({ state: 'visible' });

    // Enable WhatsApp preference if not already checked
    const waPref = page.locator('#prefWa');
    if (!(await waPref.isChecked())) await waPref.check();

    const respPromise = waitForAPI(page, '/api/members/', 'PUT');
    await page.locator('#memberForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
  });

  test('T03-06 | Disable a member', async ({ page }) => {
    await goTo(page, '/members.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME2}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#memberModal').waitFor({ state: 'visible' });

    const enabledCb = page.locator('#enabled');
    if (await enabledCb.isChecked()) await enabledCb.uncheck();

    const respPromise = waitForAPI(page, '/api/members/', 'PUT');
    await page.locator('#memberForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    // Disabled members remain in the list (not hidden), just flagged
    await expect(page.locator(`tr:has-text("${NAME2}")`).first()).toBeVisible({ timeout: 5000 });
  });

  test('T03-08 | Delete the test member', async ({ page }) => {
    await goTo(page, '/members.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME2}")`).first().locator('.btn-icon.delete').click();

    const respPromise = waitForAPI(page, '/api/members/', 'DELETE');
    await confirmDialog(page);
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    await expect(page.locator(`tr:has-text("${NAME2}")`)).toHaveCount(0, { timeout: 5000 });
  });

});
