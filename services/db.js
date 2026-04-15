// services/db.js
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const packageJson = require("../package.json");
const config = require("../config");
const { runMigrations } = require("./migration-runner");
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();
const dbService = require("./db"); 
let db;
// =============================================================================
// 1. CRYPTO HELPERS
// =============================================================================

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return { salt, hash: derivedKey.toString("hex") };
}

function verifyPassword(password, storedHash, storedSalt) {
  const derivedKey = crypto.scryptSync(password, storedSalt, 64);
  return storedHash === derivedKey.toString("hex");
}

// =============================================================================
// 2. SYSTEM & INITIALIZATION
// =============================================================================

async function initDB() {
  if (db) return db;
  const dbPath = getDbPath();

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec("PRAGMA foreign_keys = ON;");

  await runMigrations(db);

  // Set initial app version if starting fresh
  await db.run(
    "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    "app_version",
    packageJson.version,
  );

  return db;
}
async function closeDB() {
  if (db) {
    console.log("[DB] Closing database connection...");
    await db.close();
    db = null;
  }
}

function getDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const filename = config.appMode === "demo" ? "demo.db" : "fenz.db";
  return path.join(__dirname, "../" + filename);
}

// =============================================================================
// 3. DATABASE BACKUP & RESTORE
// =============================================================================

// services/db.js

/**
 * Generates a full SQL dump of the database schema and data.
 */
async function generateSqlDump() {
  if (!db) await initDB();
  
  // Get all table names
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  let dump = "PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n";

  for (const table of tables.map(t => t.name)) {
    // Get Schema
    const schema = await db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, table);
    dump += `DROP TABLE IF EXISTS ${table};\n${schema.sql};\n`;
    
    // Get Data
    const rows = await db.all(`SELECT * FROM ${table}`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const values = keys.map(k => {
          if (row[k] === null) return 'NULL';
          if (typeof row[k] === 'string') return `'${row[k].replace(/'/g, "''")}'`;
          return row[k];
      });
      dump += `INSERT INTO ${table} (${keys.join(',')}) VALUES (${values.join(',')});\n`;
    }
  }
  
  dump += "COMMIT;\nPRAGMA foreign_keys=ON;";
  return dump;
}

/**
 * Restores the database by executing a SQL script.
 */
async function restoreFromSqlDump(sqlContent) {
  if (!db) await initDB();

  try {
    console.log("[DB] Executing logical SQL restore...");
    // Execute the entire dump as a single script
    await db.exec(sqlContent);
    
    // Force Litestream to see the massive change
    await db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    
    console.log("[DB] Logical restore complete.");
    return true;
  } catch (e) {
    console.error("[DB] SQL Restore failed:", e);
    throw new Error(`SQL Restore Failed: ${e.message}`);
  }
}

/**
 * Verifies and replaces the active database with an uploaded backup.
 * Optimized for Litestream replication cycles on Google Cloud Run to prevent "malformed" errors.
 */
async function verifyAndReplaceDb(newDbPath) {
  let tempDb;
  try {
    console.log(`[DB] Verifying integrity of uploaded file: ${newDbPath}`);
    tempDb = await open({ filename: newDbPath, driver: sqlite3.Database });
    
    // Check for required tables
    const requiredTables = ["members", "skills", "preferences"];
    const tables = await tempDb.all("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map((t) => t.name);
    const missing = requiredTables.filter((t) => !tableNames.includes(t));
    
    if (missing.length > 0) throw new Error(`Incompatible Database structure.`);
    await tempDb.close();
  } catch (e) {
    if (tempDb) await tempDb.close();
    throw e;
  }

  // 1. FULL DISCONNECT
  // We must fully close the main app connection before filesystem operations.
  await closeDB();

  const currentDbPath = getDbPath();
  const walPath = `${currentDbPath}-wal`;
  const shmPath = `${currentDbPath}-shm`;

  try {
    console.log(`[DB] Executing filesystem swap...`);

    // 2. WIPE JOURNALS & CURRENT DB
    // Litestream holds handles to these. Deleting them forces Litestream to reset its sync state.
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    if (fs.existsSync(currentDbPath)) fs.unlinkSync(currentDbPath);

    // 3. COPY NEW DATABASE
    fs.copyFileSync(newDbPath, currentDbPath);
    console.log(`[DB] New database file placed.`);

    // 4. TRIGGER WAL MODE
    // Litestream requires WAL mode to sync.
    const initConn = new sqlite3.Database(currentDbPath);
    await new Promise((resolve, reject) => {
        initConn.run("PRAGMA journal_mode=WAL;", (err) => {
            if (err) reject(err);
            else {
                initConn.close();
                resolve();
            }
        });
    });

    // 5. EXTENDED SYNC WINDOW
    if (process.env.GCS_BUCKET_NAME) {
      console.log(`[DB] Cloud environment detected. Waiting for Litestream to re-index...`);
      // We give the sidecar a full 15 seconds to detect the "malformed" old state 
      // is gone and begin snapshotting the new file.
      await new Promise(resolve => setTimeout(resolve, 15000));
    }

    // 6. RE-INITIALIZE MAIN CONNECTION
    await initDB();
    console.log(`[DB] Restore complete and connection re-established.`);
    return true;

  } catch (e) {
    console.error("[DB] Restore failed:", e);
    await initDB().catch(() => {}); // Attempt recovery
    throw e;
  }
}

// ... (Authentication) ...
async function authenticateUser(email, password) {
  if (!db) await initDB();
  const user = await db.get("SELECT * FROM users WHERE email = ?", email);
  if (!user) return null;
  if (verifyPassword(password, user.hash, user.salt)) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "simple",
    };
  }
  return null;
}
async function resetLoginAttempts(userId) {
  if (!db) await initDB();
  await db.run(`UPDATE users SET login_attempts = 0 WHERE id = ?`, userId);
}

async function incrementLoginAttempts(email) {
  if (!db) await initDB();
  await db.run(
    `UPDATE users SET login_attempts = login_attempts + 1 WHERE email = ?`,
    email,
  );
  return await db.get(
    `SELECT id, login_attempts FROM users WHERE email = ?`,
    email,
  );
}

async function blockUser(userId) {
  if (!db) await initDB();
  await db.run(`UPDATE users SET blocked = 1 WHERE id = ?`, userId);
}
async function getUsers() {
  if (!db) await initDB();
  return await db.all(
    "SELECT id, email, name, role , enabled, blocked, login_attempts FROM users ORDER BY name ASC",
  );
}
async function getUserById(id) {
  if (!db) await initDB();
  return await db.get(
    "SELECT id, email, name, role , enabled, blocked, login_attempts FROM users WHERE id = ?",
    id,
  );
}
async function getUserByEmail(email) {
  if (!db) await initDB();
  return await db.get(
    "SELECT id, email, name, role , enabled, blocked, login_attempts FROM users WHERE email = ?",
    email,
  );
}
async function addUser(email, name, password, role = "simple") {
  if (!db) await initDB();
  const { salt, hash } = hashPassword(password);
  try {
    const result = await db.run(
      `INSERT INTO users (email, name, hash, salt, role, enabled, blocked, login_attempts) VALUES (?, ?, ?, ?, ?, 1, 0, 0)`,
      email,
      name,
      hash,
      salt,
      role,
    );
    return result.lastID;
  } catch (e) {
    if (e.message.includes("UNIQUE constraint"))
      throw new Error("Email already exists");
    throw e;
  }
}
async function updateUser(id, name, email, role, enabled, blocked) {
  if (!db) await initDB();
  try {
    await db.run(
      `UPDATE users 
       SET name = ?, email = ?, role = ?, enabled = ?, blocked = ? 
       WHERE id = ?`,
      name,
      email,
      role,
      enabled ? 1 : 0, // Convert booleans to integers for SQLite
      blocked ? 1 : 0,
      id,
    );

    // SECURITY: If manually unblocked, reset their attempt counter
    if (!blocked) {
      await resetLoginAttempts(id);
    }
    return true;
  } catch (e) {
    if (e.message.includes("UNIQUE constraint"))
      throw new Error("Email already exists");
    throw e;
  }
}
async function updateUserProfile(id, name, newPassword = null) {
  if (!db) await initDB();
  if (newPassword) {
    const { salt, hash } = hashPassword(newPassword);
    await db.run(
      `UPDATE users SET name = ?, hash = ?, salt = ? WHERE id = ?`,
      name,
      hash,
      salt,
      id,
    );
  } else {
    await db.run(`UPDATE users SET name = ? WHERE id = ?`, name, id);
  }
}
async function adminResetPassword(id, newPassword) {
  if (!db) await initDB();
  const { salt, hash } = hashPassword(newPassword);
  await db.run(
    `UPDATE users SET hash = ?, salt = ? WHERE id = ?`,
    hash,
    salt,
    id,
  );
}
async function deleteUser(id) {
  if (!db) await initDB();
  await db.run(`DELETE FROM users WHERE id = ?`, id);
}

// ... (Members) ...
async function getMembers() {
  if (!db) await initDB();
  const members = await db.all("SELECT * FROM members ORDER BY name ASC");
  return members.map((m) => ({ ...m, enabled: m.enabled !== 0 }));
}
async function addMember(member) {
  if (!db) await initDB();
  return (
    await db.run(
      `INSERT INTO members (name, email, mobile, messengerId, enabled, notificationPreference) VALUES (?, ?, ?, ?, ?, ?)`,
      member.name,
      member.email,
      member.mobile,
      member.messengerId,
      member.enabled !== false ? 1 : 0,
      member.notificationPreference || "email",
    )
  ).lastID;
}
async function bulkAddMembers(members) {
  if (!db) await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare(
      "INSERT INTO members (name, email, mobile, messengerId, enabled, notificationPreference) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const member of members) {
      await stmt.run(
        member.name,
        member.email,
        member.mobile,
        member.messengerId,
        member.enabled !== false ? 1 : 0,
        member.notificationPreference || "email",
      );
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
async function updateMember(id, member) {
  if (!db) await initDB();
  await db.run(
    `UPDATE members SET name = ?, email = ?, mobile = ?, messengerId = ?, enabled = ?, notificationPreference = ? WHERE id = ?`,
    member.name,
    member.email,
    member.mobile,
    member.messengerId,
    member.enabled ? 1 : 0,
    member.notificationPreference || "email",
    id,
  );
}
async function deleteMember(id) {
  if (!db) await initDB();
  await db.run("DELETE FROM members WHERE id = ?", id);
}
async function bulkDeleteMembers(ids) {
  if (!db) await initDB();
  if (!ids || ids.length === 0) return;
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare("DELETE FROM members WHERE id = ?");
    for (const id of ids) {
      await stmt.run(id);
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

// ... (Skills) ...
async function getSkills() {
  if (!db) await initDB();
  const skills = await db.all("SELECT * FROM skills ORDER BY name ASC");
  return skills.map((s) => ({
    ...s,
    critical_skill: !!s.critical_skill,
    enabled: s.enabled !== 0,
    url_type: s.url_type || "external",
  }));
}
async function addSkill(skill) {
  if (!db) await initDB();
  return (
    await db.run(
      `INSERT INTO skills (name, url, critical_skill, enabled, url_type) VALUES (?, ?, ?, ?, ?)`,
      skill.name,
      skill.url,
      skill.critical_skill ? 1 : 0,
      skill.enabled !== false ? 1 : 0,
      skill.url_type || "external",
    )
  ).lastID;
}
async function bulkAddSkills(skills) {
  if (!db) await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare(
      "INSERT INTO skills (name, url, critical_skill, enabled, url_type) VALUES (?, ?, ?, ?, ?)",
    );
    for (const skill of skills) {
      await stmt.run(
        skill.name,
        skill.url,
        skill.critical_skill ? 1 : 0,
        skill.enabled !== false ? 1 : 0,
        skill.url_type || "external",
      );
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
async function updateSkill(id, skill) {
  if (!db) await initDB();
  await db.run(
    `UPDATE skills SET name = ?, url = ?, critical_skill = ?, enabled = ?, url_type = ? WHERE id = ?`,
    skill.name,
    skill.url,
    skill.critical_skill ? 1 : 0,
    skill.enabled ? 1 : 0,
    skill.url_type || "external",
    id,
  );
}
async function deleteSkill(id) {
  if (!db) await initDB();
  await db.run("DELETE FROM skills WHERE id = ?", id);
}
async function bulkDeleteSkills(ids) {
  if (!db) await initDB();
  if (!ids || ids.length === 0) return;
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare("DELETE FROM skills WHERE id = ?");
    for (const id of ids) {
      await stmt.run(id);
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

// ... (Preferences) ...
async function getPreferences() {
  if (!db) await initDB();
  const rows = await db.all("SELECT key, value FROM preferences");
  const prefs = {};
  rows.forEach((row) => {
    try {
      prefs[row.key] = JSON.parse(row.value);
    } catch (e) {
      prefs[row.key] = row.value;
    }
  });
  return prefs;
}
async function savePreference(key, value) {
  if (!db) await initDB();
  await db.run(
    `INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    key,
    JSON.stringify(value),
  );
}
async function getAllUserPreferences(userId) {
  if (!db) await initDB();
  const rows = await db.all(
    "SELECT key, value FROM user_preferences WHERE user_id = ?",
    userId,
  );
  const prefs = {};
  rows.forEach((row) => {
    try {
      prefs[row.key] = JSON.parse(row.value);
    } catch (e) {
      prefs[row.key] = row.value;
    }
  });
  return prefs;
}
async function getUserPreference(userId, key) {
  if (!db) await initDB();
  const row = await db.get(
    "SELECT value FROM user_preferences WHERE user_id = ? AND key = ?",
    userId,
    key,
  );
  try {
    return row ? JSON.parse(row.value) : null;
  } catch (e) {
    return row ? row.value : null;
  }
}
async function saveUserPreference(userId, key, value) {
  if (!db) await initDB();
  await db.run(
    `INSERT INTO user_preferences (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    userId,
    key,
    JSON.stringify(value),
  );
}

// ... (Logs) ...
async function logEvent(user, type, title, payload) {
  if (!db) await initDB();
  try {
    await db.run(
      `INSERT INTO event_log (user, event_type, title, payload, timestamp) VALUES (?, ?, ?, ?, ?)`,
      user || "System",
      type,
      title,
      JSON.stringify(payload),
      new Date().toISOString(), // Explicitly override DEFAULT CURRENT_TIMESTAMP with ISO+Z
    );
  } catch (e) {
    console.error("Failed to write to event log:", e.message);
  }
}
async function getEventLogs(filters = {}) {
  if (!db) await initDB();
  let baseQuery = `FROM event_log WHERE 1=1`;
  const params = [];
  if (filters.user) {
    baseQuery += ` AND user = ?`;
    params.push(filters.user);
  }

if (filters.types && filters.types.length > 0) {
    // Safely ensure types is an array (splits comma-separated strings from the URL)
    const typesArray = Array.isArray(filters.types) ? filters.types : filters.types.split(',');
    
    if (typesArray.length > 0 && typesArray[0] !== '') {
        const placeholders = typesArray.map(() => "?").join(",");
        baseQuery += ` AND event_type IN (${placeholders})`;
        params.push(...typesArray);
    }
  }
  if (filters.startDate) {
    baseQuery += ` AND timestamp >= ?`;
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    baseQuery += ` AND timestamp <= ?`;
    params.push(filters.endDate + " 23:59:59");
  }
  const countResult = await db.get(
    `SELECT COUNT(*) as total ${baseQuery}`,
    params,
  );
  const total = countResult.total;
  let dataQuery = `SELECT * ${baseQuery} ORDER BY id DESC`;
  const page = filters.page && filters.page > 0 ? parseInt(filters.page) : 1;
  const limit =
    filters.limit && filters.limit > 0 ? parseInt(filters.limit) : 50;
  const offset = (page - 1) * limit;
  dataQuery += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  const rows = await db.all(dataQuery, params);
  const logs = rows.map((r) => {
    try {
      return { ...r, payload: JSON.parse(r.payload) };
    } catch (e) {
      return { ...r, payload: {} };
    }
  });
  return { logs, total, page, limit };
}
async function getEventLogMetadata() {
  if (!db) await initDB();
  const users = await db.all(
    "SELECT DISTINCT user FROM event_log ORDER BY user ASC",
  );
  const types = await db.all(
    "SELECT DISTINCT event_type FROM event_log ORDER BY event_type ASC",
  );
  return {
    users: users.map((u) => u.user),
    types: types.map((t) => t.event_type),
  };
}
async function getEventLogsExport(filters = {}) {
  if (!db) await initDB();
  let baseQuery = `SELECT * FROM event_log WHERE 1=1`;
  const params = [];
  if (filters.user) {
    baseQuery += ` AND user = ?`;
    params.push(filters.user);
  }
if (filters.types && filters.types.length > 0) {
    // Safely ensure types is an array (splits comma-separated strings from the URL)
    const typesArray = Array.isArray(filters.types) ? filters.types : filters.types.split(',');
    
    if (typesArray.length > 0 && typesArray[0] !== '') {
        const placeholders = typesArray.map(() => "?").join(",");
        baseQuery += ` AND event_type IN (${placeholders})`;
        params.push(...typesArray);
    }
  }
  if (filters.startDate) {
    baseQuery += ` AND timestamp >= ?`;
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    baseQuery += ` AND timestamp <= ?`;
    params.push(filters.endDate + " 23:59:59");
  }
  baseQuery += ` ORDER BY id DESC`;
  const rows = await db.all(baseQuery, params);
  return rows.map((r) => {
    try {
      return { ...r, payload: JSON.parse(r.payload) };
    } catch (e) {
      return { ...r, payload: {} };
    }
  });
}
async function purgeEventLog() {
  if (!db) await initDB();
  await db.run("DELETE FROM event_log");
}
async function pruneEventLog(days) {
  if (!db) await initDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  await db.run(
    "DELETE FROM event_log WHERE timestamp < ?",
    cutoff.toISOString(),
  );
}

// ... (Training & Email History) ...
async function getTrainingSessions(startDate, endDate) {
  if (!db) await initDB();
  return await db.all(
    "SELECT * FROM training_sessions WHERE date >= ? AND date <= ? ORDER BY date ASC",
    startDate,
    endDate,
  );
}
async function addTrainingSession(date, skillName) {
  if (!db) await initDB();
  return (
    await db.run(
      "INSERT INTO training_sessions (date, skill_name) VALUES (?, ?)",
      date,
      skillName,
    )
  ).lastID;
}
async function deleteTrainingSession(id) {
  if (!db) await initDB();
  await db.run("DELETE FROM training_sessions WHERE id = ?", id);
}
async function logEmailAction(member, status, details = "") {
  if (!db) await initDB();
  await db.run(
    `INSERT INTO email_history (recipient_name, recipient_email, status, details) VALUES (?, ?, ?, ?)`,
    member.name,
    member.email,
    status,
    details,
  );
}
async function getAllFutureTrainingSessions() {
  if (!db) await initDB();
  const nowString = new Date().toLocaleString("en-US", {
    timeZone: config.timezone,
  });
  const today = new Date(nowString);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return await db.all(
    "SELECT * FROM training_sessions WHERE date >= ? ORDER BY date ASC",
    `${y}-${m}-${d}`,
  );
}

/* ... (MFA) ... */
async function setMfaSecret(userId, secret) {
  if (!db) await initDB();
  await db.run("UPDATE users SET mfa_secret = ? WHERE id = ?", secret, userId);
}

async function setMfaStatus(userId, enabled) {
  if (!db) await initDB();
  await db.run(
    "UPDATE users SET mfa_enabled = ? WHERE id = ?",
    enabled ? 1 : 0,
    userId,
  );
}

async function getMfaData(userId) {
  if (!db) await initDB();
  return await db.get(
    "SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?",
    userId,
  );
}

// =============================================================================
// SURVEYS & ANONYMOUS RESPONSES
// =============================================================================

async function createSurvey(name, introText, status, structureJson, createdBy) {
  if (!db) await initDB();
  const publicId = crypto.randomUUID();
  const result = await db.run(
    `INSERT INTO surveys (public_id, name, intro_text, status, structure, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    publicId,
    name,
    introText,
    status || 0, // Fallback to 0 (disabled) if not provided
    structureJson,
    createdBy
  );
  return { id: result.lastID, publicId };
}

async function updateSurvey(id, name, introText, status, structureJson) {
  if (!db) await initDB();
  await db.run(
    `UPDATE surveys SET name = ?, intro_text = ?, status = ?, structure = ? WHERE id = ?`,
    name,
    introText,
    status || 0,
    structureJson,
    id
  );
  return true;
}

async function deleteSurvey(id) {
  if (!db) await initDB();
  // Depending on your schema, you might want to also delete from survey_tracking and survey_responses,
  // or rely on ON DELETE CASCADE in your SQLite table definition.
  await db.run(`DELETE FROM surveys WHERE id = ?`, id);
}

async function getAllSurveys() {
  if (!db) await initDB();
  // Fetch everything needed for the UI, including structure for editing
  return await db.all(
    `SELECT id, public_id, name, intro_text as intro, status, structure, created_at FROM surveys ORDER BY created_at DESC`
  );
}

async function getSurveyById(id) {
  if (!db) await initDB();
  return await db.get(
    `SELECT id, public_id, name, intro_text as intro, status, structure FROM surveys WHERE id = ?`,
    id
  );
}

async function getSurveyByPublicId(publicId) {
  if (!db) await initDB();
  return await db.get(
    `SELECT id, name, intro_text, structure, status FROM surveys WHERE public_id = ? AND status = 1`,
    publicId
  );
}

async function publishSurvey(templateId, memberIds, publishedByUserId) {
  if (!db) await initDB();
  await db.exec("BEGIN TRANSACTION");
  
  try {
    const template = await db.get(`SELECT * FROM surveys WHERE id = ?`, templateId);
    if (!template) throw new Error("Survey template not found.");

    const instanceName = `${template.name} - ${new Date().toISOString().split('T')[0]}`;
    
    const instanceResult = await db.run(
      `INSERT INTO survey_live (template_id, name, intro_text, structure, published_by) 
       VALUES (?, ?, ?, ?, ?)`,
      template.id,
      instanceName,
      template.intro_text,
      template.structure,
      publishedByUserId
    );
    
    const liveInstanceId = instanceResult.lastID;
    const trackingData = [];

    const stmt = await db.prepare(
      `INSERT INTO survey_tracking (survey_live_id, member_id, access_code) VALUES (?, ?, ?)`
    );
    
    for (const memberId of memberIds) {
      const accessCode = crypto.randomUUID();
      await stmt.run(liveInstanceId, memberId, accessCode);
      
      // Store the mapping so the API route can send the emails
      trackingData.push({ memberId, accessCode });
    }
    
    await stmt.finalize();
    await db.exec("COMMIT");
    
    return { liveInstanceId, trackingData };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function submitSurveyResponse(liveSurveyId, accessCode, submittedDataJson) {
  if (!db) await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    // 1. Verify the access code and check if already submitted
    // FIXED: Changed survey_id to survey_live_id
    const trackingRecord = await db.get(
      `SELECT id, status FROM survey_tracking WHERE survey_live_id = ? AND access_code = ?`,
      liveSurveyId,
      accessCode
    );

    if (!trackingRecord) {
      throw new Error('Invalid access code.');
    }
    if (trackingRecord.status === 'submitted') {
      throw new Error('Survey already submitted.');
    }

    // 2. Mark as submitted
    await db.run(
      `UPDATE survey_tracking SET status = 'submitted', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      trackingRecord.id
    );

    // 3. Insert the anonymous response 
    // FIXED: Changed survey_id to survey_live_id
    await db.run(
      `INSERT INTO survey_responses (survey_live_id, submitted_data) VALUES (?, ?)`,
      liveSurveyId,
      submittedDataJson
    );

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
async function getSurveyInstanceResults(liveSurveyId) {
  if (!db) await initDB();

  // 1. Get the instance details and structure
  const instance = await db.get(`SELECT * FROM survey_live WHERE id = ?`, liveSurveyId);
  if (!instance) return null;

  // 2. Get high-level completion stats
  const trackingStats = await db.get(`
    SELECT 
      COUNT(*) as totalInvited,
      SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as totalSubmitted
    FROM survey_tracking 
    WHERE survey_live_id = ?
  `, liveSurveyId);

  // 3. Get all raw anonymous responses
  const responses = await db.all(`
    SELECT submitted_data, submitted_at 
    FROM survey_responses 
    WHERE survey_live_id = ?
  `, liveSurveyId);

  return { instance, trackingStats, responses };
}

// Fetch all instances with calculated participation stats
async function getLiveSurveyInstances() {
    if (!db) await initDB();
    return await db.all(`
        SELECT 
            sl.id, sl.name, sl.published_at, sl.is_archived,
            COUNT(st.id) as total_sent,
            SUM(CASE WHEN st.status = 'submitted' THEN 1 ELSE 0 END) as total_submitted
        FROM survey_live sl
        LEFT JOIN survey_tracking st ON sl.id = st.survey_live_id
        GROUP BY sl.id
        ORDER BY sl.published_at DESC
    `);
}

// Toggle the archive flag
async function updateSurveyArchiveStatus(id, isArchived) {
    if (!db) await initDB();
    await db.run(`UPDATE survey_live SET is_archived = ? WHERE id = ?`, isArchived ? 1 : 0, id);
    return true;
}

// Transactional deletion of the instance and all related data
async function deleteSurveyInstance(id) {
    if (!db) await initDB();
    await db.exec("BEGIN TRANSACTION");
    try {
        await db.run(`DELETE FROM survey_responses WHERE survey_live_id = ?`, id);
        await db.run(`DELETE FROM survey_tracking WHERE survey_live_id = ?`, id);
        await db.run(`DELETE FROM survey_live WHERE id = ?`, id);
        await db.exec("COMMIT");
        return true;
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}
// Fetch tracking details for a specific live instance
async function getSurveyTracking(liveId) {
    if (!db) await initDB();
    // Joins the tracking table with the members table to get names and emails
    return await db.all(`
        SELECT 
            st.id as tracking_id, 
            st.access_code, 
            st.status, 
            st.completed_at,
            m.name as member_name, 
            m.email
        FROM survey_tracking st
        JOIN members m ON st.member_id = m.id
        WHERE st.survey_live_id = ?
        ORDER BY m.name ASC
    `, liveId);
}
// Fetch a specific live survey instance by its ID
async function getLiveSurveyInstanceById(id) {
    if (!db) await initDB();
    return await db.get(`SELECT * FROM survey_live WHERE id = ?`, id);
}
// Fetch a specific tracking record by its access code
async function getTrackingRecordByAccessCode(accessCode) {
    if (!db) await initDB();
    return await db.get(
        `SELECT id, survey_live_id, status FROM survey_tracking WHERE access_code = ?`, 
        accessCode
    );
}

// Bulk import surveys (wipes existing templates)
async function importAllSurveys(surveysData, createdByUserId) {
    if (!db) await initDB();
    await db.exec("BEGIN TRANSACTION");
    try {
        
        // FIXED: Added created_by to the column list and values
        const stmt = await db.prepare(`
            INSERT INTO surveys (public_id, name, intro_text, status, structure, created_by) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        for (const s of surveysData) {
             const structure = typeof s.structure === 'object' ? JSON.stringify(s.structure) : s.structure;
             
             // Generate a fresh, unique GUID for every imported template
             const newPublicId = crypto.randomUUID(); 
             
             // FIXED: Pass the createdByUserId as the final parameter
             await stmt.run(newPublicId, s.name, s.intro_text || s.intro || '', s.status || 0, structure, createdByUserId);
        }
        
        await stmt.finalize();
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}

module.exports = {
  initDB,
  closeDB,
  getDbPath,
  verifyAndReplaceDb,
  generateSqlDump,
  restoreFromSqlDump,
  authenticateUser,
  getUsers,
  getUserById,
  getUserByEmail,
  addUser,
  updateUser,
  updateUserProfile,
  adminResetPassword,
  deleteUser,
  getMembers,
  addMember,
  bulkAddMembers,
  updateMember,
  deleteMember,
  bulkDeleteMembers,
  getSkills,
  addSkill,
  bulkAddSkills,
  updateSkill,
  deleteSkill,
  bulkDeleteSkills,
  getPreferences,
  savePreference,
  getAllUserPreferences,
  getUserPreference,
  saveUserPreference,
  logEvent,
  getEventLogs,
  getEventLogMetadata,
  getEventLogsExport,
  purgeEventLog,
  pruneEventLog,
  logEmailAction,
  getTrainingSessions,
  addTrainingSession,
  getAllFutureTrainingSessions,
  deleteTrainingSession,
  resetLoginAttempts,
  incrementLoginAttempts,
  blockUser,
  setMfaSecret,
  setMfaStatus,
  getMfaData,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  getAllSurveys,
  getSurveyById,
  getSurveyByPublicId,
  publishSurvey,
  submitSurveyResponse,
  getSurveyInstanceResults,
  getLiveSurveyInstances,
  updateSurveyArchiveStatus,
  deleteSurveyInstance,
  getSurveyTracking,
  getLiveSurveyInstanceById,
  getTrackingRecordByAccessCode,
  importAllSurveys,

};

