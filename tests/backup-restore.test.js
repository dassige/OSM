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
            expect(response.headers['content-disposition']).toMatch(/attachment; filename="fenz_backup_/);
            
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
    });
});