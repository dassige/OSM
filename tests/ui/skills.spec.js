const { test, expect } = require('@playwright/test');
const { goTo, showAllRows, confirmDialog, waitForAPI } = require('./crud-helpers');

const TS    = Date.now();
const NAME  = `UAT Skill ${TS}`;
const NAME2 = `UAT Skill ${TS} v2`;
const TEST_URL = 'https://example.com/test-skill';

test.describe.serial('T04 — Skills CRUD', () => {

  test('T04-02 | Create a new skill', async ({ page }) => {
    await goTo(page, '/skills.html');

    await page.getByRole('button', { name: 'Add Skill' }).click();
    await page.locator('#skillModal').waitFor({ state: 'visible' });
    await page.fill('#name', NAME);

    const respPromise = waitForAPI(page, '/api/skills', 'POST');
    await page.locator('#skillForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    await showAllRows(page);
    await expect(page.locator(`tr:has-text("${NAME}")`).first()).toBeVisible({ timeout: 5000 });
  });

  test('T04-03 | Mark skill as critical', async ({ page }) => {
    await goTo(page, '/skills.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#skillModal').waitFor({ state: 'visible' });

    const criticalCb = page.locator('#critical_skill');
    if (!(await criticalCb.isChecked())) await criticalCb.check();

    const respPromise = waitForAPI(page, '/api/skills/', 'PUT');
    await page.locator('#skillForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
  });

  test('T04-04 | Link skill to external URL', async ({ page }) => {
    await goTo(page, '/skills.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#skillModal').waitFor({ state: 'visible' });

    // Select the External URL tab and fill in the URL
    await page.locator('#tab-external').click();
    await page.fill('#url', TEST_URL);

    const respPromise = waitForAPI(page, '/api/skills/', 'PUT');
    await page.locator('#skillForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
  });

  test('T04-06 | Disable a skill', async ({ page }) => {
    await goTo(page, '/skills.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME}")`).first().locator('.btn-icon.edit').click();
    await page.locator('#skillModal').waitFor({ state: 'visible' });

    const enabledCb = page.locator('#enabled');
    if (await enabledCb.isChecked()) await enabledCb.uncheck();

    const respPromise = waitForAPI(page, '/api/skills/', 'PUT');
    await page.locator('#skillForm').getByRole('button', { name: 'Save' }).click();
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
  });

  test('T04-08 | Delete the test skill', async ({ page }) => {
    await goTo(page, '/skills.html');
    await showAllRows(page);

    await page.locator(`tr:has-text("${NAME}")`).first().locator('.btn-icon.delete').click();

    const respPromise = waitForAPI(page, '/api/skills/', 'DELETE');
    await confirmDialog(page);
    const resp = await respPromise;

    expect(resp.status()).toBe(200);
    await expect(page.locator(`tr:has-text("${NAME}")`)).toHaveCount(0, { timeout: 5000 });
  });

});
