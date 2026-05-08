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
