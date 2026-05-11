const { chromium } = require('@playwright/test');
const path = require('path');

const TEST_PORT = process.env.TEST_PORT || 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

module.exports = async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  const username = process.env.TEST_USERNAME || 'demo';
  const password = process.env.TEST_PASSWORD || 'demo';

  const response = await context.request.post(`${BASE_URL}/login`, {
    data: { username, password },
  });

  if (!response.ok()) {
    await browser.close();
    throw new Error(`Login failed with HTTP ${response.status()} — is the server running on port ${TEST_PORT} in demo mode?`);
  }

  const body = await response.json();
  if (!body.success) {
    await browser.close();
    throw new Error(`Login rejected: ${JSON.stringify(body)}`);
  }

  await context.storageState({ path: path.join(__dirname, 'auth-state.json') });
  await browser.close();
};
