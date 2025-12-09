// services/db.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const packageJson = require('../package.json');
const config = require('../config');

let db;

// =============================================================================
// 1. CRYPTO HELPERS
// =============================================================================

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return { salt, hash: derivedKey.toString('hex') };
}

function verifyPassword(password, storedHash, storedSalt) {
    const derivedKey = crypto.scryptSync(password, storedSalt, 64);
    return storedHash === derivedKey.toString('hex');
}

// =============================================================================
// 2. SYSTEM & INITIALIZATION
// =============================================================================

async function initDB() {
    if (db) return db;
    const dbPath = getDbPath();
    console.log(`[DB] Opening database at: ${dbPath}`);

    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await db.exec('PRAGMA foreign_keys = ON;');

        // --- Core Tables ---

        // Preferences (Global)
        await db.exec(`CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT);`);
        await db.run(`INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, 'app_version', packageJson.version);

        // Email History
        await db.exec(`CREATE TABLE IF NOT EXISTS email_history (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, recipient_name TEXT, recipient_email TEXT, status TEXT, details TEXT);`);

        // Event Log
        await db.exec(`CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, user TEXT, event_type TEXT, title TEXT, payload TEXT);`);

        // --- Domain Tables ---

        // Members
        // [UPDATED] Added notificationPreference column
        await db.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, mobile TEXT, messengerId TEXT, enabled INTEGER DEFAULT 1, notificationPreference TEXT DEFAULT 'email');`);

        // Migrations for existing databases
        try { await db.exec(`ALTER TABLE members ADD COLUMN enabled INTEGER DEFAULT 1;`); } catch (e) { }
        try { await db.exec(`ALTER TABLE members ADD COLUMN notificationPreference TEXT DEFAULT 'email';`); } catch (e) { }

        // Skills
        await db.exec(`CREATE TABLE IF NOT EXISTS skills (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT, critical_skill INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1);`);
        try { await db.exec(`ALTER TABLE skills ADD COLUMN enabled INTEGER DEFAULT 1;`); } catch (e) { }

        // Users (Auth)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT DEFAULT 'simple'
            );
        `);
        try { await db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'simple';`); } catch (e) { }
        // Training Sessions
        await db.exec(`
            CREATE TABLE IF NOT EXISTS training_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL, 
                skill_name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // User Preferences
        await db.exec(`
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                PRIMARY KEY (user_id, key)
            );
        `);

        console.log('[DB] Database initialized successfully.');
        return db;
    } catch (error) {
        console.error('[DB] Initialization Failed:', error);
        throw error;
    }
}

async function closeDB() {
    if (db) {
        console.log('[DB] Closing database connection...');
        await db.close();
        db = null;
    }
}

function getDbPath() {
    if (process.env.DB_PATH) return process.env.DB_PATH;
    const filename = (config.appMode === 'demo') ? 'demo.db' : 'fenz.db';
    return path.join(__dirname, '../' + filename);
}

async function verifyAndReplaceDb(newDbPath) {
    let tempDb;
    try {
        console.log(`[DB] Verifying integrity of uploaded file: ${newDbPath}`);
        tempDb = await open({ filename: newDbPath, driver: sqlite3.Database });

        const tables = await tempDb.all("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = tables.map(t => t.name);
        const requiredTables = ['members', 'skills', 'preferences'];

        const missing = requiredTables.filter(t => !tableNames.includes(t));
        if (missing.length > 0) throw new Error(`Incompatible Database. Missing tables: ${missing.join(', ')}`);

        let dbVersion = '0.0.0';
        try {
            const row = await tempDb.get("SELECT value FROM preferences WHERE key = 'app_version'");
            if (row && row.value) dbVersion = row.value;
        } catch (e) { }

        const currentVersion = packageJson.version;
        // Optional: Relax version check if structure is stable
        // if (dbVersion !== currentVersion) throw new Error(`Version Mismatch! Uploaded DB is ${dbVersion}, App is ${currentVersion}.`);

        await tempDb.close();
    } catch (e) {
        if (tempDb) await tempDb.close();
        throw e;
    }

    await closeDB();

    const currentDbPath = getDbPath();
    try {
        console.log(`[DB] Replacing ${currentDbPath}...`);
        fs.copyFileSync(newDbPath, currentDbPath);
        await initDB();
        return true;
    } catch (e) {
        console.error('[DB] Restore failed:', e);
        await initDB();
        throw e;
    }
}

// =============================================================================
// 3. AUTHENTICATION & USER MANAGEMENT
// =============================================================================

async function authenticateUser(email, password) {
    if (!db) await initDB();
    const user = await db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user) return null;
    if (verifyPassword(password, user.hash, user.salt)) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role || 'simple'
        };
    }
    return null;
}

async function getUsers() {
    if (!db) await initDB();
    return await db.all('SELECT id, email, name, role FROM users ORDER BY name ASC');
}

async function getUserById(id) {
    if (!db) await initDB();
    return await db.get('SELECT id, email, name, role FROM users WHERE id = ?', id);
}

async function getUserByEmail(email) {
    if (!db) await initDB();
    return await db.get('SELECT id, email, name, role FROM users WHERE email = ?', email);
}

async function addUser(email, name, password, role = 'simple') {
    if (!db) await initDB();
    const { salt, hash } = hashPassword(password);
    try {
        const result = await db.run(
            `INSERT INTO users (email, name, hash, salt, role) VALUES (?, ?, ?, ?, ?)`,
            email, name, hash, salt, role
        );
        return result.lastID;
    } catch (e) {
        if (e.message.includes('UNIQUE constraint')) throw new Error('Email already exists');
        throw e;
    }
}

async function updateUser(id, name, email, role) {
    if (!db) await initDB();
    try {
        await db.run(
            `UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?`,
            name, email, role, id
        );
    } catch (e) {
        if (e.message.includes('UNIQUE constraint')) throw new Error('Email already exists');
        throw e;
    }
}

async function updateUserProfile(id, name, newPassword = null) {
    if (!db) await initDB();
    if (newPassword) {
        const { salt, hash } = hashPassword(newPassword);
        await db.run(`UPDATE users SET name = ?, hash = ?, salt = ? WHERE id = ?`, name, hash, salt, id);
    } else {
        await db.run(`UPDATE users SET name = ? WHERE id = ?`, name, id);
    }
}

async function adminResetPassword(id, newPassword) {
    if (!db) await initDB();
    const { salt, hash } = hashPassword(newPassword);
    await db.run(`UPDATE users SET hash = ?, salt = ? WHERE id = ?`, hash, salt, id);
}

async function deleteUser(id) {
    if (!db) await initDB();
    await db.run(`DELETE FROM users WHERE id = ?`, id);
}

// =============================================================================
// 4. MEMBERS MANAGEMENT
// =============================================================================

async function getMembers() {
    if (!db) await initDB();
    const members = await db.all('SELECT * FROM members ORDER BY name ASC');
    return members.map(m => ({ ...m, enabled: m.enabled !== 0 }));
}

async function addMember(member) {
    if (!db) await initDB();
    const result = await db.run(
        `INSERT INTO members (name, email, mobile, messengerId, enabled, notificationPreference) VALUES (?, ?, ?, ?, ?, ?)`,
        member.name,
        member.email,
        member.mobile,
        member.messengerId,
        member.enabled !== false ? 1 : 0,
        member.notificationPreference || 'email' // Default to email
    );
    return result.lastID;
}

async function bulkAddMembers(members) {
    if (!db) await initDB();
    await db.exec('BEGIN TRANSACTION');
    try {
        const stmt = await db.prepare('INSERT INTO members (name, email, mobile, messengerId, enabled, notificationPreference) VALUES (?, ?, ?, ?, ?, ?)');
        for (const member of members) {
            await stmt.run(
                member.name,
                member.email,
                member.mobile,
                member.messengerId,
                member.enabled !== false ? 1 : 0,
                member.notificationPreference || 'email'
            );
        }
        await stmt.finalize();
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
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
        member.notificationPreference || 'email',
        id
    );
}

async function deleteMember(id) {
    if (!db) await initDB();
    await db.run('DELETE FROM members WHERE id = ?', id);
}

async function bulkDeleteMembers(ids) {
    if (!db) await initDB();
    if (!ids || ids.length === 0) return;
    await db.exec('BEGIN TRANSACTION');
    try {
        const stmt = await db.prepare('DELETE FROM members WHERE id = ?');
        for (const id of ids) { await stmt.run(id); }
        await stmt.finalize();
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

// =============================================================================
// 5. SKILLS MANAGEMENT
// =============================================================================

async function getSkills() {
    if (!db) await initDB();
    const skills = await db.all('SELECT * FROM skills ORDER BY name ASC');
    return skills.map(s => ({ ...s, critical_skill: !!s.critical_skill, enabled: s.enabled !== 0 }));
}

async function addSkill(skill) {
    if (!db) await initDB();
    const result = await db.run(
        `INSERT INTO skills (name, url, critical_skill, enabled) VALUES (?, ?, ?, ?)`,
        skill.name, skill.url, skill.critical_skill ? 1 : 0, skill.enabled !== false ? 1 : 0
    );
    return result.lastID;
}

async function bulkAddSkills(skills) {
    if (!db) await initDB();
    await db.exec('BEGIN TRANSACTION');
    try {
        const stmt = await db.prepare('INSERT INTO skills (name, url, critical_skill, enabled) VALUES (?, ?, ?, ?)');
        for (const skill of skills) {
            await stmt.run(
                skill.name,
                skill.url,
                skill.critical_skill ? 1 : 0,
                skill.enabled !== false ? 1 : 0
            );
        }
        await stmt.finalize();
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

async function updateSkill(id, skill) {
    if (!db) await initDB();
    await db.run(
        `UPDATE skills SET name = ?, url = ?, critical_skill = ?, enabled = ? WHERE id = ?`,
        skill.name, skill.url, skill.critical_skill ? 1 : 0, skill.enabled ? 1 : 0, id
    );
}

async function deleteSkill(id) {
    if (!db) await initDB();
    await db.run('DELETE FROM skills WHERE id = ?', id);
}

async function bulkDeleteSkills(ids) {
    if (!db) await initDB();
    if (!ids || ids.length === 0) return;
    await db.exec('BEGIN TRANSACTION');
    try {
        const stmt = await db.prepare('DELETE FROM skills WHERE id = ?');
        for (const id of ids) { await stmt.run(id); }
        await stmt.finalize();
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

// =============================================================================
// 6. PREFERENCES (GLOBAL & USER)
// =============================================================================

async function getPreferences() {
    if (!db) await initDB();
    const rows = await db.all('SELECT key, value FROM preferences');
    const prefs = {};
    rows.forEach(row => {
        try { prefs[row.key] = JSON.parse(row.value); }
        catch (e) { prefs[row.key] = row.value; }
    });
    return prefs;
}

async function savePreference(key, value) {
    if (!db) await initDB();
    await db.run(`INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, JSON.stringify(value));
}

async function getAllUserPreferences(userId) {
    if (!db) await initDB();
    const rows = await db.all('SELECT key, value FROM user_preferences WHERE user_id = ?', userId);
    const prefs = {};
    rows.forEach(row => {
        try { prefs[row.key] = JSON.parse(row.value); }
        catch (e) { prefs[row.key] = row.value; }
    });
    return prefs;
}

async function getUserPreference(userId, key) {
    if (!db) await initDB();
    const row = await db.get('SELECT value FROM user_preferences WHERE user_id = ? AND key = ?', userId, key);
    try { return row ? JSON.parse(row.value) : null; } catch (e) { return row ? row.value : null; }
}

async function saveUserPreference(userId, key, value) {
    if (!db) await initDB();
    await db.run(
        `INSERT INTO user_preferences (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
        userId, key, JSON.stringify(value)
    );
}

// =============================================================================
// 7. LOGGING & AUDITING
// =============================================================================

async function logEvent(user, type, title, payload) {
    if (!db) await initDB();
    try {
        await db.run(
            `INSERT INTO event_log (user, event_type, title, payload) VALUES (?, ?, ?, ?)`,
            user || 'System', type, title, JSON.stringify(payload)
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
        const placeholders = filters.types.map(() => '?').join(',');
        baseQuery += ` AND event_type IN (${placeholders})`;
        params.push(...filters.types);
    }
    if (filters.startDate) {
        baseQuery += ` AND timestamp >= ?`;
        params.push(filters.startDate);
    }
    if (filters.endDate) {
        baseQuery += ` AND timestamp <= ?`;
        params.push(filters.endDate + ' 23:59:59');
    }

    const countResult = await db.get(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = countResult.total;

    let dataQuery = `SELECT * ${baseQuery} ORDER BY id DESC`;
    const page = filters.page && filters.page > 0 ? parseInt(filters.page) : 1;
    const limit = filters.limit && filters.limit > 0 ? parseInt(filters.limit) : 50;
    const offset = (page - 1) * limit;

    dataQuery += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db.all(dataQuery, params);
    const logs = rows.map(r => {
        try { return { ...r, payload: JSON.parse(r.payload) }; }
        catch (e) { return { ...r, payload: {} }; }
    });

    return { logs, total, page, limit };
}

async function getEventLogMetadata() {
    if (!db) await initDB();
    const users = await db.all('SELECT DISTINCT user FROM event_log ORDER BY user ASC');
    const types = await db.all('SELECT DISTINCT event_type FROM event_log ORDER BY event_type ASC');
    return { users: users.map(u => u.user), types: types.map(t => t.event_type) };
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
        const placeholders = filters.types.map(() => '?').join(',');
        baseQuery += ` AND event_type IN (${placeholders})`;
        params.push(...filters.types);
    }
    if (filters.startDate) {
        baseQuery += ` AND timestamp >= ?`;
        params.push(filters.startDate);
    }
    if (filters.endDate) {
        baseQuery += ` AND timestamp <= ?`;
        params.push(filters.endDate + ' 23:59:59');
    }
    baseQuery += ` ORDER BY id DESC`;
    const rows = await db.all(baseQuery, params);
    return rows.map(r => {
        try { return { ...r, payload: JSON.parse(r.payload) }; }
        catch (e) { return { ...r, payload: {} }; }
    });
}

async function purgeEventLog() {
    if (!db) await initDB();
    await db.run('DELETE FROM event_log');
}

async function pruneEventLog(days) {
    if (!db) await initDB();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const isoDate = cutoff.toISOString();
    await db.run('DELETE FROM event_log WHERE timestamp < ?', isoDate);
}
async function getTrainingSessions(startDate, endDate) {
    if (!db) await initDB();
    return await db.all(
        'SELECT * FROM training_sessions WHERE date >= ? AND date <= ? ORDER BY date ASC',
        startDate, endDate
    );
}

async function addTrainingSession(date, skillName) {
    if (!db) await initDB();
    const result = await db.run(
        'INSERT INTO training_sessions (date, skill_name) VALUES (?, ?)',
        date, skillName
    );
    return result.lastID;
}

async function deleteTrainingSession(id) {
    if (!db) await initDB();
    await db.run('DELETE FROM training_sessions WHERE id = ?', id);
}
async function logEmailAction(member, status, details = '') {
    if (!db) await initDB();
    await db.run(`INSERT INTO email_history (recipient_name, recipient_email, status, details) VALUES (?, ?, ?, ?)`, member.name, member.email, status, details);
}
async function getAllFutureTrainingSessions() {
    if (!db) await initDB();
    
    // [UPDATED] Use APP_TIMEZONE to determine "Today"
    // We create a date string relative to the configured timezone
    const nowString = new Date().toLocaleString('en-US', { timeZone: config.timezone });
    const today = new Date(nowString);
    
    // Format manually to YYYY-MM-DD to avoid UTC conversion issues with toISOString()
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayISO = `${y}-${m}-${d}`;

    return await db.all('SELECT * FROM training_sessions WHERE date >= ? ORDER BY date ASC', todayISO);
}

module.exports = {
    initDB,
    closeDB,
    getDbPath,
    verifyAndReplaceDb,

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
    deleteTrainingSession
};