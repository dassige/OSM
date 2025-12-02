/******************************************
 * ATTENTION!
 * MEMBERS NAMES AND SKILLS NAMES MUST BE EXACTLY AS THEY APPEAR IN THE OFFICIAL OSM SYSTEM
 ********************************/

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const packageJson = require('../package.json'); 

let db;

// Initialize the Database
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

        // 1. Preferences
        await db.exec(`
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        // Version Stamping
        await db.run(
            `INSERT INTO preferences (key, value) VALUES (?, ?) 
             ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            'app_version', packageJson.version
        );

        // 2. Email History
        await db.exec(`
            CREATE TABLE IF NOT EXISTS email_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                recipient_name TEXT,
                recipient_email TEXT,
                status TEXT,
                details TEXT
            );
        `);

        // 3. Members
        await db.exec(`
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                mobile TEXT,
                messengerId TEXT
            );
        `);

        // 4. Skills
        await db.exec(`
            CREATE TABLE IF NOT EXISTS skills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT,
                critical_skill INTEGER DEFAULT 0
            );
        `);

        // 5. Event Log (NEW TABLE)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                user TEXT,
                event_type TEXT,
                title TEXT,
                payload TEXT
            );
        `);

        console.log('[DB] Database initialized successfully.');
        return db;
    } catch (error) {
        console.error('[DB] Initialization Failed:', error);
        throw error;
    }
}

// --- Event Log Methods (NEW) ---

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

async function getEventLogs(limit = 100) {
    if (!db) await initDB();
    const rows = await db.all(`SELECT * FROM event_log ORDER BY id DESC LIMIT ?`, limit);
    return rows.map(r => {
        try {
            return { ...r, payload: JSON.parse(r.payload) };
        } catch (e) {
            return { ...r, payload: {} };
        }
    });
}

// --- Preferences Methods ---

async function getPreferences() {
    if (!db) await initDB();
    const rows = await db.all('SELECT key, value FROM preferences');
    const prefs = {};
    rows.forEach(row => {
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
        `INSERT INTO preferences (key, value) VALUES (?, ?) 
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        key, JSON.stringify(value)
    );
}

// --- Email History Methods ---

async function logEmailAction(member, status, details = '') {
    if (!db) await initDB();
    await db.run(
        `INSERT INTO email_history (recipient_name, recipient_email, status, details) 
         VALUES (?, ?, ?, ?)`,
        member.name, member.email, status, details
    );
}

// --- Member Management Methods ---

async function getMembers() {
    if (!db) await initDB();
    return await db.all('SELECT * FROM members ORDER BY name ASC');
}

async function addMember(member) {
    if (!db) await initDB();
    const result = await db.run(
        `INSERT INTO members (name, email, mobile, messengerId) VALUES (?, ?, ?, ?)`,
        member.name, member.email, member.mobile, member.messengerId
    );
    return result.lastID;
}

async function bulkAddMembers(members) {
    if (!db) await initDB();
    await db.exec('BEGIN TRANSACTION');
    try {
        const stmt = await db.prepare('INSERT INTO members (name, email, mobile, messengerId) VALUES (?, ?, ?, ?)');
        for (const member of members) {
            await stmt.run(member.name, member.email, member.mobile, member.messengerId);
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
        `UPDATE members SET name = ?, email = ?, mobile = ?, messengerId = ? WHERE id = ?`,
        member.name, member.email, member.mobile, member.messengerId, id
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
        for (const id of ids) {
            await stmt.run(id);
        }
        await stmt.finalize();
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

// --- Skill Management Methods ---

async function getSkills() {
    if (!db) await initDB();
    const skills = await db.all('SELECT * FROM skills ORDER BY name ASC');
    return skills.map(s => ({ ...s, critical_skill: !!s.critical_skill }));
}

async function addSkill(skill) {
    if (!db) await initDB();
    const result = await db.run(
        `INSERT INTO skills (name, url, critical_skill) VALUES (?, ?, ?)`,
        skill.name, skill.url, skill.critical_skill ? 1 : 0
    );
    return result.lastID;
}

async function bulkAddSkills(skills) {
    if (!db) await initDB();
    await db.exec('BEGIN TRANSACTION');
    try {
        const stmt = await db.prepare('INSERT INTO skills (name, url, critical_skill) VALUES (?, ?, ?)');
        for (const skill of skills) {
            await stmt.run(skill.name, skill.url, skill.critical_skill ? 1 : 0);
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
        `UPDATE skills SET name = ?, url = ?, critical_skill = ? WHERE id = ?`,
        skill.name, skill.url, skill.critical_skill ? 1 : 0, id
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
        for (const id of ids) {
            await stmt.run(id);
        }
        await stmt.finalize();
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

// --- System Tools Methods ---

async function closeDB() {
    if (db) {
        console.log('[DB] Closing database connection...');
        await db.close();
        db = null;
    }
}

async function verifyAndReplaceDb(newDbPath) {
    let tempDb;
    try {
        console.log(`[DB] Verifying integrity of uploaded file: ${newDbPath}`);
        tempDb = await open({
            filename: newDbPath,
            driver: sqlite3.Database
        });

        // 1. Check for required tables
        const tables = await tempDb.all("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = tables.map(t => t.name);
        const requiredTables = ['members', 'skills', 'preferences'];
        const missing = requiredTables.filter(t => !tableNames.includes(t));

        if (missing.length > 0) {
            throw new Error(`Incompatible Database. Missing tables: ${missing.join(', ')}`);
        }

        // 2. Strict Version Check
        let dbVersion = '0.0.0'; 
        try {
            const row = await tempDb.get("SELECT value FROM preferences WHERE key = 'app_version'");
            if (row && row.value) dbVersion = row.value;
        } catch (e) {
            console.warn('[DB] Could not read app_version from uploaded DB');
        }

        const currentVersion = packageJson.version;
        if (dbVersion !== currentVersion) {
            throw new Error(`Version Mismatch! Uploaded DB is ${dbVersion}, App is ${currentVersion}.`);
        }

        await tempDb.close();
    } catch (e) {
        if (tempDb) await tempDb.close(); 
        throw e;
    }

    // 3. Replace File
    await closeDB();
    const fs = require('fs');
    const currentDbPath = process.env.DB_PATH || path.join(__dirname, '../fenz.db');
    
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

function getDbPath() {
    return process.env.DB_PATH || path.join(__dirname, '../fenz.db');
}

module.exports = {
    initDB,
    getPreferences,
    savePreference,
    logEmailAction,
    getMembers, addMember, bulkAddMembers, updateMember, deleteMember, bulkDeleteMembers,
    getSkills, addSkill, bulkAddSkills, updateSkill, deleteSkill, bulkDeleteSkills,
    closeDB, verifyAndReplaceDb, getDbPath,
    logEvent, getEventLogs 
};