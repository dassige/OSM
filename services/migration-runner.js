const fs = require('fs');
const path = require('path');
const logger = require('./logger');

async function runMigrations(db) {
    logger.info('[Migrations] Checking for pending database updates...');

    // 1. Ensure migration tracking table exists
    await db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Read migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    
    if (!fs.existsSync(migrationsDir)) {
        logger.warn('[Migrations] Directory not found. Skipping.');
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Ensure 001 runs before 002

    // 3. Apply pending migrations
    for (const file of files) {
        // Check if already applied
        const record = await db.get('SELECT id FROM schema_migrations WHERE filename = ?', file);
        
        if (!record) {
            logger.info(`[Migrations] Applying: ${file}`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            
            try {
                // SQLite doesn't support multiple ALTER TABLE in one transaction block easily via exec in some drivers,
                // but splitting by semicolon is a basic way to handle multi-statement scripts.
                const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
                
                for (const stmt of statements) {
                    // Swallow "duplicate column" errors for idempotency on existing DBs
                    try {
                        await db.run(stmt);
                    } catch (err) {
                        if (!err.message.includes('duplicate column name')) {
                            throw err; // Rethrow real errors
                        }
                    }
                }

                await db.run('INSERT INTO schema_migrations (filename) VALUES (?)', file);
                logger.info(`[Migrations] Success: ${file}`);
            } catch (e) {
                logger.error(`[Migrations] FAILED: ${file}`, { error: e.message, stack: e.stack });
                process.exit(1); // Stop server start on migration fail
            }
        }
    }
    logger.info('[Migrations] Database is up to date.');
}

module.exports = { runMigrations };