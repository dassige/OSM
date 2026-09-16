/**
 * Spins up a disposable, non-demo-mode server.js instance backed by a scratch
 * copy of demo.db (see prepare-db.js), so the guide builder can drive the
 * real Start Single / Start Teams / live-hosting flows — these are hard
 * blocked by the demo-mode guard (config.appMode === 'demo') and cannot be
 * captured against a demo-mode server. Fictional Star Wars member data comes
 * along for free since it's already seeded into demo.db.
 *
 * SMTP is pointed at a non-routable address so any invitation email attempt
 * fails fast and silently instead of reaching a real mail server.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: 'localhost', port, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`Server did not become healthy on port ${port} within ${timeoutMs}ms`));
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

/**
 * @param {object} opts
 * @param {number} opts.port
 * @param {string} opts.dbPath
 * @param {string} opts.username
 * @param {string} opts.password
 */
async function startCaptureServer({ port, dbPath, username, password }) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      // 'development' — not 'demo' — so the demo-mode guard never blocks
      // Start Single/Teams or live hosting, but COOKIE_SECURE=false (no TLS
      // on localhost) is still accepted by env-validator.js.
      APP_MODE: 'development',
      COOKIE_SECURE: 'false',
      DB_PATH: dbPath,
      APP_USERNAME: username,
      APP_PASSWORD: password,
      SESSION_SECRET: 'guide-builder-scratch-session-secret-not-for-real-use-32chars',
      SMTP_SERVICE: '',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1',
      SMTP_USER: 'guide-builder@invalid.local',
      SMTP_PASS: 'invalid',
      ENABLE_WHATSAPP: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let startupLog = '';
  child.stdout.on('data', (d) => { startupLog += d.toString(); });
  child.stderr.on('data', (d) => { startupLog += d.toString(); });

  const exitedEarly = new Promise((_, reject) => {
    child.once('exit', (code) => reject(new Error(`server.js exited early (code ${code}). Output:\n${startupLog}`)));
  });

  await Promise.race([waitForHealth(port), exitedEarly]);

  return {
    baseUrl: `http://localhost:${port}`,
    async stop() {
      await new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
        setTimeout(resolve, 3000);
      });
    },
  };
}

module.exports = { startCaptureServer };
