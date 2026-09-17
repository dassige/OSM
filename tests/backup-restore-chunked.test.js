const request = require('supertest');
const fs      = require('fs');
const path    = require('path');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    restoreFromSqlDump: jest.fn().mockResolvedValue(),
    logEvent:           jest.fn().mockResolvedValue(),
    getDbPath:          jest.fn().mockReturnValue('/tmp/test.db'),
    getKbDocuments:     jest.fn().mockResolvedValue([]),
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next()
}));

jest.mock('../middleware/rate-limiter', () => ({
    backupLimiter:       (req, res, next) => next(),
    restoreLimiter:      (req, res, next) => next(),
    restoreChunkLimiter: (req, res, next) => next(),
    aiTestLimiter:       (req, res, next) => next(),
}));

const db = require('../services/db');
const systemRoutes = require('../routes/api/system');
const app = createTestApp({ path: '/api', router: systemRoutes });

const CHUNK_ROOT = path.join('uploads', 'chunks');

// Leftover chunk directories from a real (non-test) run, or from a failed test,
// would otherwise make "unknown uploadId" tests flaky — start and end clean.
// The chunks ROOT itself must survive: multer's DiskStorage only mkdir's its
// destination once, at module load, not per-request — deleting the root here
// (rather than just its per-uploadId contents) would break every subsequent
// chunk upload with ENOENT.
function cleanupUploads() {
    fs.rmSync(CHUNK_ROOT, { recursive: true, force: true });
    fs.mkdirSync(CHUNK_ROOT, { recursive: true });
    for (const f of fs.existsSync('uploads') ? fs.readdirSync('uploads') : []) {
        if (/^[a-f0-9-]{36}-reassembled/.test(f)) fs.unlinkSync(path.join('uploads', f));
    }
}

describe('Chunked restore upload (large backups)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.getKbDocuments.mockResolvedValue([]);
        cleanupUploads();
    });

    afterAll(cleanupUploads);

    describe('POST /api/system/restore/chunk', () => {
        const uploadId = '11111111-1111-1111-1111-111111111111';

        it('stores the chunk on disk keyed by uploadId and index', async () => {
            const res = await request(app)
                .post('/api/system/restore/chunk')
                .field('uploadId', uploadId)
                .field('chunkIndex', '0')
                .field('totalChunks', '2')
                .attach('chunk', Buffer.from('hello'), 'part');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, received: 1, total: 2 });
            expect(fs.readFileSync(path.join(CHUNK_ROOT, uploadId, '00000'), 'utf8')).toBe('hello');
        });

        it('rejects a missing chunk file', async () => {
            const res = await request(app)
                .post('/api/system/restore/chunk')
                .field('uploadId', uploadId)
                .field('chunkIndex', '0')
                .field('totalChunks', '2');

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/no chunk uploaded/i);
        });

        it('rejects a malformed uploadId (path traversal attempt)', async () => {
            const res = await request(app)
                .post('/api/system/restore/chunk')
                .field('uploadId', '../../etc')
                .field('chunkIndex', '0')
                .field('totalChunks', '1')
                .attach('chunk', Buffer.from('x'), 'part');

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/invalid uploadid/i);
            // The uploaded temp file must not be left behind after rejection
            expect(fs.existsSync(path.join(CHUNK_ROOT, '..', '..', 'etc'))).toBe(false);
        });

        it('rejects an out-of-range chunkIndex', async () => {
            const res = await request(app)
                .post('/api/system/restore/chunk')
                .field('uploadId', uploadId)
                .field('chunkIndex', '5')
                .field('totalChunks', '2')
                .attach('chunk', Buffer.from('x'), 'part');

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/invalid chunkindex/i);
        });
    });

    describe('POST /api/system/restore/finalize', () => {
        const uploadId = '22222222-2222-2222-2222-222222222222';

        async function uploadChunks(parts) {
            for (let i = 0; i < parts.length; i++) {
                const res = await request(app)
                    .post('/api/system/restore/chunk')
                    .field('uploadId', uploadId)
                    .field('chunkIndex', String(i))
                    .field('totalChunks', String(parts.length))
                    .attach('chunk', Buffer.from(parts[i]), 'part');
                expect(res.status).toBe(200);
            }
        }

        it('reassembles chunks in order and runs the SQL restore', async () => {
            const validSql = "DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);";
            const half = Math.ceil(validSql.length / 2);
            await uploadChunks([validSql.slice(0, half), validSql.slice(half)]);

            const res = await request(app)
                .post('/api/system/restore/finalize')
                .send({ uploadId, filename: 'backup.sql', totalChunks: 2 });

            expect(res.status).toBe(200);
            expect(db.restoreFromSqlDump).toHaveBeenCalledWith(validSql);
            expect(db.logEvent).toHaveBeenCalledWith(
                expect.any(String), 'System', 'Database Restored via SQL', { sourceFile: 'backup.sql' },
            );

            // Cleaned up after a successful finalize
            expect(fs.existsSync(path.join(CHUNK_ROOT, uploadId))).toBe(false);
        });

        it('returns 400 when chunks never completed (missing a piece)', async () => {
            await uploadChunks(['only-one-of-two']);

            const res = await request(app)
                .post('/api/system/restore/finalize')
                .send({ uploadId, filename: 'backup.sql', totalChunks: 2 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/missing chunk/i);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });

        it('returns 400 for an uploadId with no chunks at all', async () => {
            const res = await request(app)
                .post('/api/system/restore/finalize')
                .send({ uploadId: '33333333-3333-3333-3333-333333333333', filename: 'backup.sql', totalChunks: 1 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/unknown or expired/i);
        });

        it('rejects a malformed uploadId', async () => {
            const res = await request(app)
                .post('/api/system/restore/finalize')
                .send({ uploadId: 'not-a-uuid', filename: 'backup.sql', totalChunks: 1 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/invalid uploadid/i);
        });

        it('propagates the underlying restore failure as its own status code', async () => {
            const maliciousSql = "BEGIN TRANSACTION;\nDELETE FROM users WHERE 1=1;\nCOMMIT;";
            await uploadChunks([maliciousSql]);

            const res = await request(app)
                .post('/api/system/restore/finalize')
                .send({ uploadId, filename: 'evil.sql', totalChunks: 1 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/not permitted/i);
            expect(db.restoreFromSqlDump).not.toHaveBeenCalled();
        });
    });
});
