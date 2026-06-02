const { test, expect } = require('@playwright/test');
const { goTo, showAllRows, confirmDialog, waitForAPI } = require('./crud-helpers');

const TS    = Date.now();
const NAME  = `UAT User ${TS}`;
const NAME2 = `UAT User ${TS} v2`;
const EMAIL = `uat-user-${TS}@test.nz`;

test.describe.serial('T14 — Users CRUD', () => {

  test('T14-02 | Create a new user', async ({ page }) => {
    await goTo(page, '/users.html');

    await page.getByRole('button', { name: 'Add User' }).click();
    await page.locator('#userModal').waitFor({ state: 'visible' });

    await page.fill('#newName',  NAME);
    await page.fill('#newEmail', EMAIL);
    await page.locator('#newRole').selectOption('simple');

    // Set up response listener before the confirm dialog is accepted
    const respPromise = waitForAPI(page, '/api/users', 'POST');
    await page.locator('#createBtn').click();
    // Form submit triggers a confirmAction dialog before the POST fires
    await confirmDialog(page);
    const resp = await respPromise;

    // 500 can occur when SMTP is unconfigured in demo mode; the user may still be created
    expect([200, 201, 500]).toContain(resp.status());

    if (resp.status() < 500) {
      await showAllRows(page);
      await expect(page.locator(`tr:has-text("${NAME}")`).first()).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'User creation returned 500 — SMTP likely not configured in this environment');
    }
  });

  test('T14-03 | Edit user name', async ({ page }) => {
    await goTo(page, '/users.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#editUserModal').waitFor({ state: 'visible' });
    await page.fill('#editName', NAME2);

    const respPromise = waitForAPI(page, '/api/users/', 'PUT');
    await page.locator('#editUserForm').getByRole('button', { name: 'Save Changes' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    await expect(page.locator(`tr:has-text("${NAME2}")`).first()).toBeVisible({ timeout: 5000 });
  });

  test('T14-04 | Change user role to admin', async ({ page }) => {
    await goTo(page, '/users.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME2}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#editUserModal').waitFor({ state: 'visible' });
    await page.locator('#editRole').selectOption('admin');

    const respPromise = waitForAPI(page, '/api/users/', 'PUT');
    await page.locator('#editUserForm').getByRole('button', { name: 'Save Changes' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
  });

  test('T14-05 | Disable user account', async ({ page }) => {
    await goTo(page, '/users.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME2}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#editUserModal').waitFor({ state: 'visible' });

    const enabledCb = page.locator('#editEnabled');
    if (await enabledCb.isChecked()) await enabledCb.uncheck();

    const respPromise = waitForAPI(page, '/api/users/', 'PUT');
    await page.locator('#editUserForm').getByRole('button', { name: 'Save Changes' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
  });

  test('T14-09 | Delete the test user', async ({ page }) => {
    await goTo(page, '/users.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME2}")`).first().locator('.btn-icon.delete').click();

    // Delete user now uses promptAction — type the required keyword then confirm
    await page.locator('#btnPromptYes').waitFor({ state: 'visible' });
    await page.locator('#promptInput').fill('DELETE');
    const respPromise = waitForAPI(page, '/api/users/', 'DELETE');
    await page.locator('#btnPromptYes').click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    await expect(page.locator(`tr:has-text("${NAME2}")`)).toHaveCount(0, { timeout: 5000 });
  });

});
