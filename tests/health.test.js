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
    aiConfig: {},
    enableWhatsApp: false
}));
jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));
jest.mock('../services/whatsapp-service', () => ({
    getStatus: jest.fn()
}));

const db = require('../services/db');
const config = require('../config');
const whatsappService = require('../services/whatsapp-service');
const systemRoutes = require('../routes/api/system');
const app = createTestApp({ path: '/api', router: systemRoutes });

describe('GET /api/csrf-token', () => {
    it('returns 200 with a 64-char hex CSRF token', async () => {
        const response = await request(app).get('/api/csrf-token');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body.token).toMatch(/^[0-9a-f]{64}$/);
    });
});

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

describe('GET /api/ready', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        config.enableWhatsApp = false;
    });

    it('returns 200 with whatsapp disabled when WhatsApp is off', async () => {
        db.initDB.mockResolvedValue({ get: jest.fn().mockResolvedValue({ 1: 1 }) });

        const response = await request(app).get('/api/ready');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ready');
        expect(response.body.db).toBe('ok');
        expect(response.body.whatsapp).toBe('disabled');
    });

    it('returns 200 when DB ok and WhatsApp client is ready', async () => {
        config.enableWhatsApp = true;
        db.initDB.mockResolvedValue({ get: jest.fn().mockResolvedValue({ 1: 1 }) });
        whatsappService.getStatus.mockReturnValue({ status: 'ready', queueSize: 0 });

        const response = await request(app).get('/api/ready');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ready');
        expect(response.body.whatsapp).toEqual({ status: 'ready', queueSize: 0 });
    });

    it('returns 503 when WhatsApp client is still initialising', async () => {
        config.enableWhatsApp = true;
        db.initDB.mockResolvedValue({ get: jest.fn().mockResolvedValue({ 1: 1 }) });
        whatsappService.getStatus.mockReturnValue({ status: 'initializing', queueSize: 3 });

        const response = await request(app).get('/api/ready');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('starting');
        expect(response.body.whatsapp).toEqual({ status: 'initializing', queueSize: 3 });
    });

    it('returns 503 when the database is unreachable', async () => {
        db.initDB.mockRejectedValueOnce(new Error('DB error'));

        const response = await request(app).get('/api/ready');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('error');
    });
});
