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

        // Enable foreign keys and WAL mode for better concurrency
        await db.exec('PRAGMA foreign_keys = ON;');
        
        // --- Schema Definition ---
        
        // 1. Preferences Table (Key-Value Store)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        // 2. Email History Table (For future use)
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
    
    // Convert array of rows [{key, value}, ...] to object { key: value }
    const prefs = {};
    rows.forEach(row => {
        try {
            // Try to parse JSON (for booleans, numbers, arrays)
            prefs[row.key] = JSON.parse(row.value);
        } catch (e) {
            // Fallback to string
            prefs[row.key] = row.value;
        }
    });
    return prefs;
}

async function savePreference(key, value) {
    if (!db) await initDB();
    const stringValue = JSON.stringify(value);
    
    // Upsert (Insert or Replace)
    await db.run(
        `INSERT INTO preferences (key, value) VALUES (?, ?) 
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        key, stringValue
    );
}

// --- History Methods (General Structure) ---

async function logEmailAction(member, status, details = '') {
    if (!db) await initDB();
    await db.run(
        `INSERT INTO email_history (recipient_name, recipient_email, status, details) 
         VALUES (?, ?, ?, ?)`,
        member.name, member.email, status, details
    );
}

module.exports = { 
    initDB, 
    getPreferences, 
    savePreference, 
    logEmailAction 
};