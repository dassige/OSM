const TEST_PORT = process.env.TEST_PORT || 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

module.exports = {
  globalSetup: require.resolve('./tests/ui/global-setup.js'),
  use: {
    baseURL: BASE_URL,
    storageState: 'tests/ui/auth-state.json',
  },
  webServer: {
    command: 'node server.js',
    url: BASE_URL,
    reuseExistingServer: true,
    env: {
      APP_MODE: 'demo',
      PORT: String(TEST_PORT),
    },
    timeout: 30_000,
  },
  testDir: './tests/ui',
  reporter: 'list',
};
