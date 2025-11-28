const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;

// Initialize the Database
async function initDB() {
    if (db) return db;

    try {
        db = await open({
            filename: path.join(__dirname, '../fenz.db'),
            driver: sqlite3.Database
        });

        // Enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON;');
        
        // --- Schema Definition ---
        
        // 1. Preferences Table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        // 2. Email History Table
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

        // 3. Members Table (NEW)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                mobile TEXT,
                messengerId TEXT
            );
        `);

        console.log('[DB] Database initialized successfully.');
        return db;
    } catch (error) {
        console.error('[DB] Initialization Failed:', error);
        throw error;
    }
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

// --- Member Management Methods (NEW) ---

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
//  Bulk Import Function
async function bulkAddMembers(members) {
    if (!db) await initDB();
    
    // Use a transaction for speed and safety
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
// Bulk Delete Function
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

module.exports = { 
    initDB, 
    getPreferences, 
    savePreference, 
    logEmailAction,
    getMembers,
    addMember,
    bulkAddMembers, 
    bulkDeleteMembers,
    updateMember,
    deleteMember
};