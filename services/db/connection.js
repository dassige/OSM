const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const packageJson = require("../../package.json");
const config = require("../../config");
const { runMigrations } = require("../migration-runner");
const logger = require("../logger");

let db;

async function initDB() {
  if (db) return db;
  const dbPath = getDbPath();
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA foreign_keys = ON;");
  // WAL mode is required for Litestream (production). On Windows bind mounts
  // inside Docker the shared-memory (.shm) file creation can fail — fall back
  // gracefully so local development still works.
  try {
    const result = await db.get("PRAGMA journal_mode=WAL;");
    if (result?.journal_mode && result.journal_mode !== "wal") {
      logger.warn(`[DB] WAL mode could not be enabled (current: ${result.journal_mode}). Litestream requires WAL in production.`);
    }
  } catch (walErr) {
    logger.warn(`[DB] WAL mode failed: ${walErr.message} — continuing without it. Ensure a Linux-native filesystem path in production.`);
  }
  await runMigrations(db);
  await db.run(
    "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    "app_version",
    packageJson.version,
  );
  return db;
}

async function closeDB() {
  if (db) {
    logger.info("[DB] Closing database connection...");
    await db.close();
    db = null;
  }
}

function getDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const filename = config.appMode === "demo" ? "demo.db" : "fenz.db";
  return path.join(__dirname, "../../" + filename);
}

module.exports = { initDB, closeDB, getDbPath };
