const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const fs = require("fs");
const path = require("path");
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
    // Quote table names to prevent injection if a restored table name ever contains
    // special characters, and to make the dump unambiguous.
    const quotedTable = `"${table.replace(/"/g, '""')}"`;
    dump += `DROP TABLE IF EXISTS ${quotedTable};\n${schema.sql};\n`;

    const rows = await db.all(`SELECT * FROM ${quotedTable}`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const values = keys.map((k) => {
        if (row[k] === null) return "NULL";
        if (typeof row[k] === "string") return `'${row[k].replace(/'/g, "''")}'`;
        return row[k];
      });
      dump += `INSERT INTO ${quotedTable} (${keys.join(",")}) VALUES (${values.join(",")});\n`;
    }
  }

  dump += "COMMIT;\nPRAGMA foreign_keys=ON;";
  return dump;
}

async function clearSessions() {
  const sessionsDbPath = path.join(path.dirname(getDbPath()), "sessions.db");
  let sessDb;
  try {
    sessDb = await open({ filename: sessionsDbPath, driver: sqlite3.Database });
    await sessDb.run("DELETE FROM sessions");
    logger.info("[DB] All sessions cleared after restore.");
  } catch (e) {
    // sessions.db may not exist (first boot, or non-persistent env) — not fatal
    logger.warn("[DB] Could not clear sessions (may not exist yet):", e.message);
  } finally {
    if (sessDb) await sessDb.close();
  }
}

// Allowlist of statement types that can legitimately appear in an OpReady SQL dump.
// Any statement whose beginning does not match one of these patterns is rejected.
const ALLOWED_STMT_PREFIXES = [
  /^PRAGMA\s+foreign_keys\s*=/i,
  /^BEGIN(\s+TRANSACTION)?$/i,
  /^COMMIT$/i,
  /^DROP\s+TABLE\s+IF\s+EXISTS\s+/i,
  /^CREATE\s+(TABLE|UNIQUE\s+INDEX|INDEX)(\s+IF\s+NOT\s+EXISTS)?\s+/i,
  /^INSERT\s+INTO\s+/i,
];

/**
 * Splits a SQL string into individual statements, correctly handling
 * single-quoted string literals (including '' escaped quotes) and -- line comments.
 * This prevents statement-keyword detection from being fooled by content inside
 * string values (e.g. a member answer that contains "UPDATE ..." on its own line).
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (inString) {
      current += ch;
      if (ch === "'") {
        if (i + 1 < sql.length && sql[i + 1] === "'") {
          // Escaped single-quote '' — consume both chars and stay inside string
          current += sql[++i];
        } else {
          inString = false;
        }
      }
    } else if (ch === "'") {
      inString = true;
      current += ch;
    } else if (ch === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
      // Line comment: skip everything up to (but not including) the newline
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    } else if (ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
    } else {
      current += ch;
    }

    i++;
  }

  // Capture any trailing content that has no terminating semicolon
  const last = current.trim();
  if (last) statements.push(last);

  return statements;
}

function validateSqlDump(sqlContent) {
  const statements = splitSqlStatements(sqlContent);
  for (const stmt of statements) {
    if (!stmt) continue;
    const allowed = ALLOWED_STMT_PREFIXES.some(pattern => pattern.test(stmt));
    if (!allowed) {
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
      throw new Error(`Invalid SQL content: statement type not permitted in restore file. (${preview})`);
    }
  }
}

async function restoreFromSqlDump(sqlContent) {
  validateSqlDump(sqlContent);
  const db = await initDB();
  try {
    logger.info("[DB] Executing logical SQL restore...");
    await db.exec(sqlContent);
    await db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    logger.info("[DB] Logical restore complete.");
  } catch (e) {
    logger.error("[DB] SQL Restore failed", e);
    throw new Error(`SQL Restore Failed: ${e.message}`);
  }

  // Close and reopen so runMigrations() applies any migrations the backup may
  // be missing (e.g. a backup taken before a new feature was shipped).
  await closeDB();
  await initDB();
  logger.info("[DB] Post-restore migration check complete.");

  // Clear all sessions so users must re-authenticate against the restored
  // users table.  Using DELETE (not fs.unlinkSync) so the change is visible
  // to the open connect-sqlite3 handle — required on Linux / Cloud Run.
  await clearSessions();

  return true;
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
    logger.error("[DB] Restore failed", e);
    await initDB().catch(() => {});
    throw e;
  }
}

module.exports = { generateSqlDump, restoreFromSqlDump, verifyAndReplaceDb, clearSessions, validateSqlDump };
