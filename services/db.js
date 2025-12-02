// services/db.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const crypto = require('crypto');
const packageJson = require('../package.json'); 

let db;

// --- Helper: Password Hashing ---
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return { salt, hash: derivedKey.toString('hex') };
}

function verifyPassword(password, storedHash, storedSalt) {
    const derivedKey = crypto.scryptSync(password, storedSalt, 64);
    return storedHash === derivedKey.toString('hex');
}

// --- Initialize Database ---
async function initDB() {
    if (db) return db;
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../fenz.db');
    console.log(`[DB] Opening database at: ${dbPath}`);
    
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await db.exec('PRAGMA foreign_keys = ON;');

        // Create Tables
        await db.exec(`CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT);`);
        await db.run(`INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, 'app_version', packageJson.version);

        await db.exec(`CREATE TABLE IF NOT EXISTS email_history (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, recipient_name TEXT, recipient_email TEXT, status TEXT, details TEXT);`);
        await db.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, mobile TEXT, messengerId TEXT);`);
        await db.exec(`CREATE TABLE IF NOT EXISTS skills (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT, critical_skill INTEGER DEFAULT 0);`);
        await db.exec(`CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, user TEXT, event_type TEXT, title TEXT, payload TEXT);`);
        
        // Users Table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                hash TEXT NOT NULL,
                salt TEXT NOT NULL
            );
        `);

        console.log('[DB] Database initialized successfully.');
        return db;
    } catch (error) {
        console.error('[DB] Initialization Failed:', error);
        throw error;
    }
}

// --- Event Log ---
async function logEvent(user, type, title, payload) {
    if (!db) await initDB();
    try {
        await db.run(`INSERT INTO event_log (user, event_type, title, payload) VALUES (?, ?, ?, ?)`, user || 'System', type, title, JSON.stringify(payload));
    } catch (e) { console.error("Failed to write to event log:", e.message); }
}

async function getEventLogs(limit = 100) {
    if (!db) await initDB();
    const rows = await db.all(`SELECT * FROM event_log ORDER BY id DESC LIMIT ?`, limit);
    return rows.map(r => { try { return { ...r, payload: JSON.parse(r.payload) }; } catch (e) { return { ...r, payload: {} }; } });
}

// --- Preferences ---
async function getPreferences() {
    if (!db) await initDB();
    const rows = await db.all('SELECT key, value FROM preferences');
    const prefs = {};
    rows.forEach(row => { try { prefs[row.key] = JSON.parse(row.value); } catch (e) { prefs[row.key] = row.value; } });
    return prefs;
}

async function savePreference(key, value) {
    if (!db) await initDB();
    await db.run(`INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, JSON.stringify(value));
}

// --- Email History ---
async function logEmailAction(member, status, details = '') {
    if (!db) await initDB();
    await db.run(`INSERT INTO email_history (recipient_name, recipient_email, status, details) VALUES (?, ?, ?, ?)`, member.name, member.email, status, details);
}

// --- Members ---
async function getMembers() { if (!db) await initDB(); return await db.all('SELECT * FROM members ORDER BY name ASC'); }
async function addMember(member) { if (!db) await initDB(); const result = await db.run(`INSERT INTO members (name, email, mobile, messengerId) VALUES (?, ?, ?, ?)`, member.name, member.email, member.mobile, member.messengerId); return result.lastID; }
async function bulkAddMembers(members) { if (!db) await initDB(); await db.exec('BEGIN TRANSACTION'); try { const stmt = await db.prepare('INSERT INTO members (name, email, mobile, messengerId) VALUES (?, ?, ?, ?)'); for (const member of members) { await stmt.run(member.name, member.email, member.mobile, member.messengerId); } await stmt.finalize(); await db.exec('COMMIT'); } catch (error) { await db.exec('ROLLBACK'); throw error; } }
async function updateMember(id, member) { if (!db) await initDB(); await db.run(`UPDATE members SET name = ?, email = ?, mobile = ?, messengerId = ? WHERE id = ?`, member.name, member.email, member.mobile, member.messengerId, id); }
async function deleteMember(id) { if (!db) await initDB(); await db.run('DELETE FROM members WHERE id = ?', id); }
async function bulkDeleteMembers(ids) { if (!db) await initDB(); if (!ids || ids.length === 0) return; await db.exec('BEGIN TRANSACTION'); try { const stmt = await db.prepare('DELETE FROM members WHERE id = ?'); for (const id of ids) { await stmt.run(id); } await stmt.finalize(); await db.exec('COMMIT'); } catch (error) { await db.exec('ROLLBACK'); throw error; } }

// --- Skills ---
async function getSkills() { if (!db) await initDB(); const skills = await db.all('SELECT * FROM skills ORDER BY name ASC'); return skills.map(s => ({ ...s, critical_skill: !!s.critical_skill })); }
async function addSkill(skill) { if (!db) await initDB(); const result = await db.run(`INSERT INTO skills (name, url, critical_skill) VALUES (?, ?, ?)`, skill.name, skill.url, skill.critical_skill ? 1 : 0); return result.lastID; }
async function bulkAddSkills(skills) { if (!db) await initDB(); await db.exec('BEGIN TRANSACTION'); try { const stmt = await db.prepare('INSERT INTO skills (name, url, critical_skill) VALUES (?, ?, ?)'); for (const skill of skills) { await stmt.run(skill.name, skill.url, skill.critical_skill ? 1 : 0); } await stmt.finalize(); await db.exec('COMMIT'); } catch (error) { await db.exec('ROLLBACK'); throw error; } }
async function updateSkill(id, skill) { if (!db) await initDB(); await db.run(`UPDATE skills SET name = ?, url = ?, critical_skill = ? WHERE id = ?`, skill.name, skill.url, skill.critical_skill ? 1 : 0, id); }
async function deleteSkill(id) { if (!db) await initDB(); await db.run('DELETE FROM skills WHERE id = ?', id); }
async function bulkDeleteSkills(ids) { if (!db) await initDB(); if (!ids || ids.length === 0) return; await db.exec('BEGIN TRANSACTION'); try { const stmt = await db.prepare('DELETE FROM skills WHERE id = ?'); for (const id of ids) { await stmt.run(id); } await stmt.finalize(); await db.exec('COMMIT'); } catch (error) { await db.exec('ROLLBACK'); throw error; } }

// --- User Management (NEW) ---
async function authenticateUser(email, password) {
    if (!db) await initDB();
    const user = await db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user) return null;
    if (verifyPassword(password, user.hash, user.salt)) {
        return { id: user.id, name: user.name, email: user.email };
    }
    return null;
}

// NEW: Look up user for password reset
async function getUserByEmail(email) {
    if (!db) await initDB();
    return await db.get('SELECT id, email, name FROM users WHERE email = ?', email);
}

async function getUsers() {
    if (!db) await initDB();
    return await db.all('SELECT id, email, name FROM users ORDER BY name ASC');
}

async function getUserById(id) {
    if (!db) await initDB();
    return await db.get('SELECT id, email, name FROM users WHERE id = ?', id);
}

async function addUser(email, name, password) {
    if (!db) await initDB();
    const { salt, hash } = hashPassword(password);
    try {
        const result = await db.run(
            `INSERT INTO users (email, name, hash, salt) VALUES (?, ?, ?, ?)`,
            email, name, hash, salt
        );
        return result.lastID;
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

// --- System Tools ---
async function closeDB() { if (db) { console.log('[DB] Closing database connection...'); await db.close(); db = null; } }
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
        try { const row = await tempDb.get("SELECT value FROM preferences WHERE key = 'app_version'"); if (row && row.value) dbVersion = row.value; } catch (e) {}
        const currentVersion = packageJson.version;
        if (dbVersion !== currentVersion) throw new Error(`Version Mismatch! Uploaded DB is ${dbVersion}, App is ${currentVersion}.`);
        await tempDb.close();
    } catch (e) { if (tempDb) await tempDb.close(); throw e; }
    await closeDB();
    const fs = require('fs');
    const currentDbPath = process.env.DB_PATH || path.join(__dirname, '../fenz.db');
    try { console.log(`[DB] Replacing ${currentDbPath}...`); fs.copyFileSync(newDbPath, currentDbPath); await initDB(); return true; } catch (e) { console.error('[DB] Restore failed:', e); await initDB(); throw e; }
}
function getDbPath() { return process.env.DB_PATH || path.join(__dirname, '../fenz.db'); }

module.exports = {
    initDB,
    getPreferences, savePreference,
    logEmailAction,
    getMembers, addMember, bulkAddMembers, updateMember, deleteMember, bulkDeleteMembers,
    getSkills, addSkill, bulkAddSkills, updateSkill, deleteSkill, bulkDeleteSkills,
    closeDB, verifyAndReplaceDb, getDbPath,
    logEvent, getEventLogs,
    // User Mgmt
    authenticateUser, getUserByEmail, getUsers, getUserById, addUser, updateUserProfile, adminResetPassword, deleteUser
};