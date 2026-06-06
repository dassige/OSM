const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    listApiKeys:      jest.fn(),
    createApiKey:     jest.fn(),
    getApiKeyById:    jest.fn().mockResolvedValue({ id: 1, name: 'Test Key', key_prefix: 'osm_abc123', role: 'admin', active: 1 }),
    toggleApiKey:     jest.fn().mockResolvedValue(),
    deleteApiKey:     jest.fn().mockResolvedValue(),
    listApiCallLog:   jest.fn(),
    exportApiCallLog: jest.fn(),
    purgeApiCallLog:  jest.fn(),
    logEvent:         jest.fn().mockResolvedValue()
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));

const db = require('../services/db');
const apiKeyRoutes = require('../routes/api/api-keys');

const app = createTestApp([{ path: '/api/api-keys', router: apiKeyRoutes }]);

describe('API Keys Endpoints (Isolated)', () => {
    beforeEach(() => jest.clearAllMocks());

    // -----------------------------------------------------------------------
    // GET /api/api-keys
    // -----------------------------------------------------------------------
    describe('GET /api/api-keys', () => {
        it('returns 200 with array of keys', async () => {
            const mockKeys = [
                { id: 1, name: 'Key A', key_prefix: 'osm_aaa', role: 'admin', active: 1 },
                { id: 2, name: 'Key B', key_prefix: 'osm_bbb', role: 'simple', active: 0 }
            ];
            db.listApiKeys.mockResolvedValue(mockKeys);

            const res = await request(app).get('/api/api-keys');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockKeys);
            expect(db.listApiKeys).toHaveBeenCalledTimes(1);
        });
    });

    // -----------------------------------------------------------------------
    // POST /api/api-keys
    // -----------------------------------------------------------------------
    describe('POST /api/api-keys', () => {
        it.each(['superadmin', 'admin', 'simple', 'guest'])(
            'creates a key with role "%s" and returns 200 with key + prefix',
            async (role) => {
                db.createApiKey.mockResolvedValue({ raw: 'osm_fullkeyvalue', prefix: 'osm_fullkey0' });

                const res = await request(app)
                    .post('/api/api-keys')
                    .send({ name: 'Test Key', role });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.key).toBe('osm_fullkeyvalue');
                expect(res.body.prefix).toBe('osm_fullkey0');
                expect(db.createApiKey).toHaveBeenCalledWith('Test Key', role, expect.any(String));
                expect(db.logEvent).toHaveBeenCalledWith(
                    expect.any(String),
                    'API Keys',
                    'API Key Created',
                    expect.objectContaining({ role })
                );
            }
        );

        it('returns 400 when name is missing', async () => {
            const res = await request(app)
                .post('/api/api-keys')
                .send({ role: 'admin' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/name/i);
        });

        it('returns 400 when name is blank whitespace', async () => {
            const res = await request(app)
                .post('/api/api-keys')
                .send({ name: '   ', role: 'admin' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/name/i);
        });

        it('returns 400 for an invalid role', async () => {
            const res = await request(app)
                .post('/api/api-keys')
                .send({ name: 'Test Key', role: 'manager' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/role/i);
        });

        it('returns 400 for legacy role "viewer" that was never valid', async () => {
            const res = await request(app)
                .post('/api/api-keys')
                .send({ name: 'Test Key', role: 'viewer' });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // PATCH /api/api-keys/:id/toggle
    // -----------------------------------------------------------------------
    describe('PATCH /api/api-keys/:id/toggle', () => {
        it('toggles a key and returns success', async () => {
            const res = await request(app).patch('/api/api-keys/1/toggle');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(db.getApiKeyById).toHaveBeenCalledWith(1);
            expect(db.toggleApiKey).toHaveBeenCalledWith(1);
            expect(db.logEvent).toHaveBeenCalledWith(
                expect.any(String),
                'API Keys',
                'API Key Toggled',
                expect.objectContaining({ newState: 'disabled' })
            );
        });

        it('returns 500 on db error', async () => {
            db.toggleApiKey.mockRejectedValueOnce(new Error('DB failure'));

            const res = await request(app).patch('/api/api-keys/1/toggle');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('DB failure');
        });
    });

    // -----------------------------------------------------------------------
    // DELETE /api/api-keys/:id
    // -----------------------------------------------------------------------
    describe('DELETE /api/api-keys/:id', () => {
        it('deletes a key and returns success', async () => {
            const res = await request(app).delete('/api/api-keys/1');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(db.getApiKeyById).toHaveBeenCalledWith(1);
            expect(db.deleteApiKey).toHaveBeenCalledWith(1);
            expect(db.logEvent).toHaveBeenCalledWith(
                expect.any(String),
                'API Keys',
                'API Key Deleted',
                expect.objectContaining({ keyName: 'Test Key', role: 'admin' })
            );
        });

        it('returns 500 on db error', async () => {
            db.deleteApiKey.mockRejectedValueOnce(new Error('DB failure'));

            const res = await request(app).delete('/api/api-keys/1');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('DB failure');
        });
    });

    // -----------------------------------------------------------------------
    // GET /api/api-keys/call-log
    // -----------------------------------------------------------------------
    describe('GET /api/api-keys/call-log', () => {
        it('returns 200 with rows and total', async () => {
            const mockResult = {
                rows: [
                    { id: 1, api_key_id: 1, key_name: 'Test Key', key_prefix: 'osm_abc123',
                      method: 'GET', endpoint: '/api/members', origin_ip: '127.0.0.1',
                      user_agent: 'curl/7.88', status_code: 200, logged_at: '2025-01-01T00:00:00' }
                ],
                total: 1
            };
            db.listApiCallLog.mockResolvedValue(mockResult);

            const res = await request(app).get('/api/api-keys/call-log?page=1&limit=25');

            expect(res.status).toBe(200);
            expect(res.body.rows).toHaveLength(1);
            expect(res.body.total).toBe(1);
            expect(db.listApiCallLog).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 25 }));
        });

        it('passes filter params to db function', async () => {
            db.listApiCallLog.mockResolvedValue({ rows: [], total: 0 });

            await request(app).get('/api/api-keys/call-log?keyId=2&method=POST&endpoint=%2Fapi%2Fmembers');

            expect(db.listApiCallLog).toHaveBeenCalledWith(expect.objectContaining({
                keyId: 2, method: 'POST', endpoint: '/api/members'
            }));
        });

        it('passes sort params to db function', async () => {
            db.listApiCallLog.mockResolvedValue({ rows: [], total: 0 });

            await request(app).get('/api/api-keys/call-log?sort=status_code&sortDir=asc');

            expect(db.listApiCallLog).toHaveBeenCalledWith(expect.objectContaining({
                sort: 'status_code', sortDir: 'asc'
            }));
        });

        it('defaults sort to logged_at desc when not specified', async () => {
            db.listApiCallLog.mockResolvedValue({ rows: [], total: 0 });

            await request(app).get('/api/api-keys/call-log');

            expect(db.listApiCallLog).toHaveBeenCalledWith(expect.objectContaining({
                sort: 'logged_at', sortDir: 'desc'
            }));
        });

        it('returns 500 on db error', async () => {
            db.listApiCallLog.mockRejectedValueOnce(new Error('DB failure'));

            const res = await request(app).get('/api/api-keys/call-log');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('DB failure');
        });
    });

    // -----------------------------------------------------------------------
    // GET /api/api-keys/call-log/export
    // -----------------------------------------------------------------------
    describe('GET /api/api-keys/call-log/export', () => {
        it('returns 200 with exportedAt, count, and records array', async () => {
            const mockRecords = [
                { id: 1, key_name: 'Test Key', method: 'GET', endpoint: '/api/members?active=1', status_code: 200, logged_at: '2025-01-01T00:00:00' }
            ];
            db.exportApiCallLog.mockResolvedValue(mockRecords);

            const res = await request(app).get('/api/api-keys/call-log/export');

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(1);
            expect(res.body.records).toHaveLength(1);
            expect(res.body.exportedAt).toBeDefined();
            expect(res.headers['content-disposition']).toMatch(/attachment.*api-call-log/);
        });

        it('passes filter and sort params to db function', async () => {
            db.exportApiCallLog.mockResolvedValue([]);

            await request(app).get('/api/api-keys/call-log/export?sort=status_code&sortDir=asc&method=GET');

            expect(db.exportApiCallLog).toHaveBeenCalledWith(expect.objectContaining({
                sort: 'status_code', sortDir: 'asc', method: 'GET'
            }));
        });

        it('returns 500 on db error', async () => {
            db.exportApiCallLog.mockRejectedValueOnce(new Error('DB failure'));

            const res = await request(app).get('/api/api-keys/call-log/export');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('DB failure');
        });
    });

    // -----------------------------------------------------------------------
    // DELETE /api/api-keys/call-log
    // -----------------------------------------------------------------------
    describe('DELETE /api/api-keys/call-log', () => {
        it('purges entries and returns deletedCount', async () => {
            db.purgeApiCallLog.mockResolvedValue(42);

            const res = await request(app).delete('/api/api-keys/call-log?days=90');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.deletedCount).toBe(42);
            expect(db.purgeApiCallLog).toHaveBeenCalledWith(90);
            expect(db.logEvent).toHaveBeenCalledWith(
                expect.any(String),
                'API Keys',
                'API Call Log Purged',
                expect.objectContaining({ olderThanDays: 90, deletedCount: 42 })
            );
        });

        it('defaults to 30 days when days param is missing', async () => {
            db.purgeApiCallLog.mockResolvedValue(0);

            await request(app).delete('/api/api-keys/call-log');

            expect(db.purgeApiCallLog).toHaveBeenCalledWith(30);
        });

        it('returns 500 on db error', async () => {
            db.purgeApiCallLog.mockRejectedValueOnce(new Error('DB failure'));

            const res = await request(app).delete('/api/api-keys/call-log?days=30');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('DB failure');
        });
    });
});
