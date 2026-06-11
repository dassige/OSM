const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    generateSqlDump: jest.fn(),
    restoreFromSqlDump: jest.fn().mockResolvedValue(),
    logEvent: jest.fn().mockResolvedValue(),
    getDbPath: jest.fn().mockReturnValue('/tmp/test.db'),
}));

// We already verified Role checks in security.test.js, so we bypass them here
jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next()
}));

jest.mock('../middleware/rate-limiter', () => ({
    backupLimiter:  (req, res, next) => next(),
    restoreLimiter: (req, res, next) => next(),
    aiTestLimiter:  (req, res, next) => next(),
}));

const db = require('../services/db');
const systemRoutes = require('../routes/api/system');

// systemRoutes defines paths like "/system/backup", so we mount the router at "/api"
const app = createTestApp({ path: '/api', router: systemRoutes });

describe('Database Backup & Restore API (Isolated)', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/system/backup', () => {
        
        it('should return a 200 and trigger a file download containing the SQL dump', async () => {
            const fakeSql = 'CREATE TABLE test (id INT); INSERT INTO test VALUES (1);';
            db.generateSqlDump.mockResolvedValue(fakeSql);

            const response = await request(app).get('/api/system/backup');

            expect(response.status).toBe(200);
            expect(response.text).toBe(fakeSql);
            
            expect(response.headers['content-type']).toMatch(/text\/plain/);
            expect(response.headers['content-disposition']).toMatch(/attachment; filename="opready-db-backup-/);
            
            expect(db.generateSqlDump).toHaveBeenCalledTimes(1);
            expect(db.logEvent).toHaveBeenCalledWith(
                expect.any(String), // Session user name injected by test-utils
                'System', 
                'SQL Dump Exported', 
                expect.any(Object)
            );
        });

        it('should return 500 if database dump fails', async () => {
            db.generateSqlDump.mockRejectedValue(new Error('Database Locked'));

            const response = await request(app).get('/api/system/backup');

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Database Locked');
        });
    });

    describe('POST /api/system/restore', () => {
        
        it('should return 400 Bad Request if no file is uploaded', async () => {
            const response = await request(app).post('/api/system/restore');
            
            expect(response.status).toBe(400);
            expect(response.body.error).toBe('No file uploaded.');
        });

        it('should safely process an uploaded SQL file and clean it up from disk', async () => {
            const fakeSqlContent = 'DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);';
            
            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(fakeSqlContent), 'test_backup.sql');

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/reconstructed successfully/);
            
            // Prove the router extracted the text from the uploaded file and sent it to the DB
            expect(db.restoreFromSqlDump).toHaveBeenCalledWith(fakeSqlContent);
            
            expect(db.logEvent).toHaveBeenCalledWith(
                expect.any(String),
                'System',
                'Database Restored via SQL',
                { sourceFile: 'test_backup.sql' }
            );
        });

        it('should return 400 if the SQL file contains an ATTACH DATABASE statement', async () => {
            const maliciousSql = "BEGIN TRANSACTION;\nATTACH DATABASE '/tmp/evil.db' AS evil;\nCOMMIT;";

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(maliciousSql), 'evil.sql');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/not permitted/i);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });

        it('should return 400 if the SQL file contains a CREATE TRIGGER statement', async () => {
            const maliciousSql = "CREATE TRIGGER bad_trigger AFTER INSERT ON members BEGIN SELECT load_extension('/tmp/evil'); END;";

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(maliciousSql), 'evil.sql');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/not permitted/i);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });

        it('should return 400 if the SQL file contains an UPDATE statement (privilege escalation attempt)', async () => {
            const maliciousSql = [
                "PRAGMA foreign_keys=OFF;",
                "BEGIN TRANSACTION;",
                "UPDATE users SET role='superadmin', hash='abc', salt='def' WHERE email='attacker@evil.com';",
                "COMMIT;",
                "PRAGMA foreign_keys=ON;",
            ].join('\n');

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(maliciousSql), 'evil.sql');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/not permitted/i);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });

        it('should return 400 if the SQL file contains a DELETE statement', async () => {
            const maliciousSql = "BEGIN TRANSACTION;\nDELETE FROM users WHERE 1=1;\nCOMMIT;";

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(maliciousSql), 'evil.sql');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/not permitted/i);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });

        it('should return 400 if the SQL file contains SELECT load_extension', async () => {
            const maliciousSql = "BEGIN TRANSACTION;\nSELECT load_extension('/tmp/evil.so');\nCOMMIT;";

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(maliciousSql), 'evil.sql');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/not permitted/i);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });

        it('should return 400 if ATTACH DATABASE is disguised with a comment (bypass attempt)', async () => {
            const maliciousSql = "BEGIN TRANSACTION;\nATTACH/**/DATABASE '/tmp/evil.db' AS evil;\nCOMMIT;";

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(maliciousSql), 'evil.sql');

            expect(response.status).toBe(400);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });

        it('should accept a valid dump that contains multi-line CREATE TABLE', async () => {
            const validSql = [
                "PRAGMA foreign_keys=OFF;",
                "BEGIN TRANSACTION;",
                'DROP TABLE IF EXISTS "members";',
                "CREATE TABLE members (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);",
                'INSERT INTO "members" (id,name) VALUES (1,\'Alice\');',
                "COMMIT;",
                "PRAGMA foreign_keys=ON;",
            ].join('\n');

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(validSql), 'backup.sql');

            expect(response.status).toBe(200);
            expect(db.restoreFromSqlDump).toHaveBeenCalledWith(validSql);
        });

        it('should accept a valid dump containing a multi-line string value with a word on its own line', async () => {
            // Regression: multi-line INSERT values must not be misidentified as statement starts
            const validSql = [
                "PRAGMA foreign_keys=OFF;",
                "BEGIN TRANSACTION;",
                'DROP TABLE IF EXISTS "live_forms";',
                "CREATE TABLE live_forms (id INTEGER PRIMARY KEY, answer TEXT);",
                "INSERT INTO \"live_forms\" (id,answer) VALUES (1,'First line\nSecond line\nThird line');",
                "COMMIT;",
                "PRAGMA foreign_keys=ON;",
            ].join('\n');

            const response = await request(app)
                .post('/api/system/restore')
                .attach('databaseFile', Buffer.from(validSql), 'backup.sql');

            expect(response.status).toBe(200);
            expect(db.restoreFromSqlDump).toHaveBeenCalledWith(validSql);
        });
    });
});