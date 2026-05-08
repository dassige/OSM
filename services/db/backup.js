const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const fs = require("fs");
const { initDB, closeDB, getDbPath } = require("./connection");
const logger = require("../logger");

async function generateSqlDump() {
  const db = await initDB();
  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  let dump = "PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n";

  for (const table of tables.map((t) => t.name)) {
    const schema = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", table);
    dump += `DROP TABLE IF EXISTS ${table};\n${schema.sql};\n`;

    const rows = await db.all(`SELECT * FROM ${table}`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const values = keys.map((k) => {
        if (row[k] === null) return "NULL";
        if (typeof row[k] === "string") return `'${row[k].replace(/'/g, "''")}'`;
        return row[k];
      });
      dump += `INSERT INTO ${table} (${keys.join(",")}) VALUES (${values.join(",")});\n`;
    }
  }

  dump += "COMMIT;\nPRAGMA foreign_keys=ON;";
  return dump;
}

async function restoreFromSqlDump(sqlContent) {
  const db = await initDB();
  try {
    logger.info("[DB] Executing logical SQL restore...");
    await db.exec(sqlContent);
    await db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    logger.info("[DB] Logical restore complete.");
    return true;
  } catch (e) {
    logger.error("[DB] SQL Restore failed", { error: e.message });
    throw new Error(`SQL Restore Failed: ${e.message}`);
  }
}

async function verifyAndReplaceDb(newDbPath) {
  let tempDb;
  try {
    logger.info(`[DB] Verifying integrity of uploaded file: ${newDbPath}`);
    tempDb = await open({ filename: newDbPath, driver: sqlite3.Database });
    const requiredTables = ["members", "skills", "preferences"];
    const tables = await tempDb.all("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map((t) => t.name);
    const missing = requiredTables.filter((t) => !tableNames.includes(t));
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
    logger.error("[DB] Restore failed", { error: e.message });
    await initDB().catch(() => {});
    throw e;
  }
}

module.exports = { generateSqlDump, restoreFromSqlDump, verifyAndReplaceDb };
