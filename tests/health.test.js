const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    initDB: jest.fn()
}));
jest.mock('../services/ai-service', () => ({
    evaluateTextAnswer: jest.fn()
}));
jest.mock('../config', () => ({
    appMode: 'production',
    auth: {},
    aiConfig: {}
}));
jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));

const db = require('../services/db');
const systemRoutes = require('../routes/api/system');
const app = createTestApp({ path: '/api', router: systemRoutes });

describe('GET /api/health', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should return 200 with ok status when the database is reachable', async () => {
        db.initDB.mockResolvedValue({ get: jest.fn().mockResolvedValue({ 1: 1 }) });

        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.db).toBe('ok');
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('uptime');
        expect(typeof response.body.uptime).toBe('number');
    });

    it('should return 503 with error status when the database is unreachable', async () => {
        db.initDB.mockRejectedValueOnce(new Error('SQLITE_CANTOPEN'));

        const response = await request(app).get('/api/health');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('error');
        expect(response.body.db).toBe('unreachable');
        expect(response.body.error).toBe('SQLITE_CANTOPEN');
        expect(response.body).toHaveProperty('version');
    });
});
