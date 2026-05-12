const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    listApiKeys:  jest.fn(),
    createApiKey: jest.fn(),
    getApiKeyById: jest.fn().mockResolvedValue({ id: 1, name: 'Test Key', key_prefix: 'osm_abc123', role: 'admin', active: 1 }),
    toggleApiKey: jest.fn().mockResolvedValue(),
    deleteApiKey: jest.fn().mockResolvedValue(),
    logEvent:     jest.fn().mockResolvedValue()
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
});
