/**
 * Prepares an isolated, disposable copy of the local demo database for the
 * guide builder to run a real quiz session against — never the real fenz.db,
 * and never the repo's own demo.db (which backs npm run test:ui and must not
 * pick up sessions/teams created during a screenshot capture run).
 *
 * The copy is seeded with the two example quiz games (same idempotent logic
 * as scripts/generate-demo-db.js) if they are not already present, so the
 * guide can always run standalone even against a fresh demo.db.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3');

const ROOT = path.join(__dirname, '..', '..', '..');
const SOURCE_DB = path.join(ROOT, 'demo.db');
const QUIZ_EXAMPLES_DIR = path.join(ROOT, 'examples', 'quiz');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}

/**
 * Copies demo.db to a scratch path and seeds example quiz games into it.
 * Returns the scratch DB path.
 */
async function prepareCaptureDb(outDir) {
  if (!fs.existsSync(SOURCE_DB)) {
    throw new Error(`demo.db not found at ${SOURCE_DB} — run "npm run generate-demo-db" first.`);
  }

  const scratchDir = path.join(os.tmpdir(), 'opready-guide-builder');
  fs.mkdirSync(scratchDir, { recursive: true });
  const capturePath = path.join(scratchDir, `capture-${Date.now()}.db`);
  fs.copyFileSync(SOURCE_DB, capturePath);

  const db = new sqlite3.Database(capturePath);
  try {
    const existing = await get(db, 'SELECT COUNT(*) as c FROM quiz_games');
    if (existing.c === 0 && fs.existsSync(QUIZ_EXAMPLES_DIR)) {
      const files = fs.readdirSync(QUIZ_EXAMPLES_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const game = JSON.parse(fs.readFileSync(path.join(QUIZ_EXAMPLES_DIR, file), 'utf8'));
        await run(
          db,
          `INSERT INTO quiz_games (name, description, game_type, enabled, questions) VALUES (?, ?, ?, 1, ?)`,
          [game.name, game.description, game.game_type, JSON.stringify(game.questions)],
        );
      }
    }
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }

  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  return capturePath;
}

function cleanupCaptureDb(capturePath) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = capturePath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

module.exports = { prepareCaptureDb, cleanupCaptureDb };
