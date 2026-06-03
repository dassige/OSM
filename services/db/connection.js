const path = require("path");
const packageJson = require("../../package.json");
const config = require("../../config");
const { runMigrations } = require("../migration-runner");
const logger = require("../logger");

let adapter; // shared singleton — either SQLite or PostgreSQL adapter

async function initDB() {
  if (adapter) return adapter;

  if (config.database.type === "postgresql") {
    adapter = await initPostgres();
  } else {
    adapter = await initSqlite();
  }

  await runMigrations(adapter);

  await adapter.run(
    "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    "app_version",
    packageJson.version,
  );

  return adapter;
}

// ── SQLite initialisation ─────────────────────────────────────────────────

async function initSqlite() {
  const sqlite3 = require("sqlite3");
  const { open } = require("sqlite");
  const { createSqliteAdapter } = require("./adapters/sqlite-adapter");

  const dbPath = getDbPath();
  const sqliteDb = await open({ filename: dbPath, driver: sqlite3.Database });

  await sqliteDb.exec("PRAGMA foreign_keys = ON;");

  // WAL mode is required for Litestream (production). On Windows bind mounts
  // inside Docker the shared-memory (.shm) file creation can fail — fall back
  // gracefully so local development still works.
  try {
    const result = await sqliteDb.get("PRAGMA journal_mode=WAL;");
    if (result?.journal_mode && result.journal_mode !== "wal") {
      logger.warn(`[DB] WAL mode could not be enabled (current: ${result.journal_mode}). Litestream requires WAL in production.`);
    }
  } catch (walErr) {
    logger.warn(`[DB] WAL mode failed: ${walErr.message} — continuing without it. Ensure a Linux-native filesystem path in production.`);
  }

  return createSqliteAdapter(sqliteDb);
}

// ── PostgreSQL initialisation ─────────────────────────────────────────────

async function initPostgres() {
  const { createPgAdapter, createPool } = require("./adapters/pg-adapter");

  const pool = createPool(config.database);

  // Verify connectivity before proceeding.
  const client = await pool.connect();
  client.release();
  logger.info("[DB] PostgreSQL connection pool established.");

  return createPgAdapter(pool);
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function closeDB() {
  if (adapter) {
    logger.info("[DB] Closing database connection...");
    await adapter.close();
    adapter = null;
  }
}

function getDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const filename = config.appMode === "demo" ? "demo.db" : "fenz.db";
  return path.join(__dirname, "../../" + filename);
}

module.exports = { initDB, closeDB, getDbPath };
