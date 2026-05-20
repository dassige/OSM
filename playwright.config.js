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
      PORT: String(TEST_PORT),
      APP_USERNAME: 'demo',
      APP_PASSWORD: 'demo',
    },
    timeout: 30_000,
  },
  testDir: './tests/ui',
  reporter: 'list',
};
