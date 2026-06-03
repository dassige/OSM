const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');

// Transforms SQLite-dialect DDL to PostgreSQL-compatible DDL.
// Only applied when DB_TYPE=postgresql; SQLite migrations run unchanged.
function preprocessForPostgres(sql) {
  return sql
    // INTEGER PRIMARY KEY AUTOINCREMENT → BIGSERIAL PRIMARY KEY
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'BIGSERIAL PRIMARY KEY')
    // sqlite datetime() function → standard CURRENT_TIMESTAMP
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    // Strip PRAGMA statements entirely
    .replace(/PRAGMA\s+[^;]*/gi, '');
}

async function runMigrations(db) {
    logger.info('[Migrations] Checking for pending database updates...');

    const isPostgres = config.database.type === 'postgresql';

    // The schema_migrations table itself must be created with the correct
    // dialect — apply the same preprocessing to this bootstrap DDL.
    const bootstrapSql = `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `;
    const createMigrationsTable = isPostgres
        ? preprocessForPostgres(bootstrapSql)
        : bootstrapSql;

    await db.exec(createMigrationsTable);

    const migrationsDir = path.join(__dirname, '../migrations');

    if (!fs.existsSync(migrationsDir)) {
        logger.warn('[Migrations] Directory not found. Skipping.');
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        const record = await db.get('SELECT id FROM schema_migrations WHERE filename = ?', file);

        if (!record) {
            logger.info(`[Migrations] Applying: ${file}`);
            let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

            if (isPostgres) sql = preprocessForPostgres(sql);

            try {
                const statements = sql
                    .split(';')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);

                for (const stmt of statements) {
                    try {
                        await db.run(stmt);
                    } catch (err) {
                        // Swallow "duplicate column" / "already exists" errors for
                        // idempotency on existing databases.
                        const msg = err.message || '';
                        const isDuplicate =
                            msg.includes('duplicate column name') ||       // SQLite
                            msg.includes('already exists') ||              // PostgreSQL
                            msg.includes('column') && msg.includes('of relation'); // PostgreSQL ALTER
                        if (!isDuplicate) throw err;
                    }
                }

                await db.run('INSERT INTO schema_migrations (filename) VALUES (?)', file);
                logger.info(`[Migrations] Success: ${file}`);
            } catch (e) {
                logger.error(`[Migrations] FAILED: ${file}`, { error: e.message, stack: e.stack });
                process.exit(1);
            }
        }
    }
    logger.info('[Migrations] Database is up to date.');
}

module.exports = { runMigrations };
