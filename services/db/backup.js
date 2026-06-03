const fs = require("fs");
const path = require("path");
const { initDB, closeDB, getDbPath } = require("./connection");
const config = require("../../config");
const logger = require("../logger");

// ── Shared helpers ────────────────────────────────────────────────────────

function quoteValue(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  return v;
}

// ── SQL dump generation ───────────────────────────────────────────────────

async function generateSqlDump() {
  const db = await initDB();

  if (config.database.type === "postgresql") {
    return generatePostgresDump(db);
  }
  return generateSqliteDump(db);
}

// SQLite dump: includes DROP/CREATE DDL + INSERT rows.
async function generateSqliteDump(db) {
  // sqlite_master is SQLite-specific; bypass the adapter's normalisation
  // by querying directly via the underlying sqlite package.
  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );

  let dump = "-- OpReady Database Dump\n";
  dump += "-- DB Type: sqlite\n";
  dump += `-- Version: ${config.ui?.version || ''}\n\n`;
  dump += "PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n";

  for (const { name: table } of tables) {
    const schema = await db.get(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
      table
    );
    dump += `DROP TABLE IF EXISTS ${table};\n${schema.sql};\n`;

    const rows = await db.all(`SELECT * FROM ${table}`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const values = keys.map(k => quoteValue(row[k]));
      dump += `INSERT INTO ${table} (${keys.join(",")}) VALUES (${values.join(",")});\n`;
    }
    dump += "\n";
  }

  dump += "COMMIT;\nPRAGMA foreign_keys=ON;\n";
  return dump;
}

// PostgreSQL dump: data-only (TRUNCATE + INSERT), wrapped in a transaction.
// The schema is managed by migrations and is not included in the dump.
async function generatePostgresDump(db) {
  const tables = await db.all(
    `SELECT tablename AS name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND tablename NOT IN ('schema_migrations')
     ORDER BY tablename`
  );

  let dump = "-- OpReady Database Dump\n";
  dump += "-- DB Type: postgresql\n";
  dump += `-- Version: ${config.ui?.version || ''}\n\n`;
  dump += "BEGIN;\n\n";

  // Truncate in reverse alphabetical order to minimise FK conflicts, then
  // let CASCADE handle remaining constraints.
  const tableNames = tables.map(t => t.name);
  if (tableNames.length > 0) {
    dump += `TRUNCATE TABLE ${tableNames.map(n => `"${n}"`).join(", ")} CASCADE;\n\n`;
  }

  for (const { name: table } of tables) {
    const rows = await db.all(`SELECT * FROM "${table}"`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const values = keys.map(k => quoteValue(row[k]));
      dump += `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(",")}) VALUES (${values.join(",")});\n`;
    }
    if (rows.length > 0) dump += "\n";
  }

  dump += "COMMIT;\n";
  return dump;
}

// ── Restore ───────────────────────────────────────────────────────────────

async function restoreFromSqlDump(sqlContent) {
  if (config.database.type === "postgresql") {
    return restorePostgres(sqlContent);
  }
  return restoreSqlite(sqlContent);
}

async function restoreSqlite(sqlContent) {
  const db = await initDB();
  try {
    logger.info("[DB] Executing logical SQL restore (SQLite)...");
    await db.exec(sqlContent);
    // Compact the WAL file after a large restore.
    await db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    logger.info("[DB] Logical restore complete.");
  } catch (e) {
    logger.error("[DB] SQL Restore failed", e);
    throw new Error(`SQL Restore Failed: ${e.message}`);
  }

  // Reopen so runMigrations() applies any migrations the backup may be missing.
  await closeDB();
  await initDB();
  logger.info("[DB] Post-restore migration check complete.");

  await clearSessions();
  return true;
}

async function restorePostgres(sqlContent) {
  // Validate this is a PostgreSQL dump before attempting restore.
  if (!sqlContent.includes("-- DB Type: postgresql")) {
    throw new Error(
      "Incompatible backup format. This instance uses PostgreSQL but the " +
      "backup was created from a SQLite database."
    );
  }

  const db = await initDB();
  try {
    logger.info("[DB] Executing logical SQL restore (PostgreSQL)...");
    await db.exec(sqlContent);
    logger.info("[DB] Logical restore complete.");
  } catch (e) {
    logger.error("[DB] SQL Restore failed", e);
    throw new Error(`SQL Restore Failed: ${e.message}`);
  }

  // Reopen so runMigrations() applies any new migrations.
  await closeDB();
  await initDB();
  logger.info("[DB] Post-restore migration check complete.");

  await clearSessions();
  return true;
}

// ── Physical file restore (SQLite only) ──────────────────────────────────

async function verifyAndReplaceDb(newDbPath) {
  if (config.database.type === "postgresql") {
    throw new Error(
      "Physical file restore is not supported for PostgreSQL. " +
      "Use the SQL dump restore option instead."
    );
  }

  const sqlite3 = require("sqlite3");
  const { open } = require("sqlite");

  let tempDb;
  try {
    logger.info(`[DB] Verifying integrity of uploaded file: ${newDbPath}`);
    tempDb = await open({ filename: newDbPath, driver: sqlite3.Database });
    const requiredTables = ["members", "skills", "preferences"];
    const tables = await tempDb.all("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map(t => t.name);
    const missing = requiredTables.filter(t => !tableNames.includes(t));
    if (missing.length > 0) throw new Error("Incompatible Database structure.");
    await tempDb.close();
  } catch (e) {
    if (tempDb) await tempDb.close();
    throw e;
  }

  await closeDB();

  const currentDbPath = getDbPath();
  const walPath = `${currentDbPath}-wal`;
  const shmPath = `${currentDbPath}-shm`;

  try {
    logger.info("[DB] Executing filesystem swap...");
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    if (fs.existsSync(currentDbPath)) fs.unlinkSync(currentDbPath);

    fs.copyFileSync(newDbPath, currentDbPath);
    logger.info("[DB] New database file placed.");

    const initConn = new sqlite3.Database(currentDbPath);
    await new Promise((resolve, reject) => {
      initConn.run("PRAGMA journal_mode=WAL;", (err) => {
        if (err) reject(err);
        else { initConn.close(); resolve(); }
      });
    });

    if (process.env.GCS_BUCKET_NAME) {
      logger.info("[DB] Cloud environment detected. Waiting for Litestream to re-index...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }

    await initDB();
    logger.info("[DB] Restore complete and connection re-established.");
    return true;
  } catch (e) {
    logger.error("[DB] Restore failed", e);
    await initDB().catch(() => {});
    throw e;
  }
}

// ── Session clearing ──────────────────────────────────────────────────────

async function clearSessions() {
  // Sessions are always stored in a local SQLite file regardless of DB_TYPE.
  const sqlite3 = require("sqlite3");
  const { open } = require("sqlite");
  const sessionsDbPath = path.join(path.dirname(getDbPath()), "sessions.db");
  let sessDb;
  try {
    sessDb = await open({ filename: sessionsDbPath, driver: sqlite3.Database });
    await sessDb.run("DELETE FROM sessions");
    logger.info("[DB] All sessions cleared after restore.");
  } catch (e) {
    logger.warn("[DB] Could not clear sessions (may not exist yet):", e.message);
  } finally {
    if (sessDb) await sessDb.close();
  }
}

module.exports = { generateSqlDump, restoreFromSqlDump, verifyAndReplaceDb, clearSessions };
