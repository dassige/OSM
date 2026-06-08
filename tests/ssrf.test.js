const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('axios');

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
}));

jest.mock('../middleware/rate-limiter', () => ({
    backupLimiter:  (req, res, next) => next(),
    restoreLimiter: (req, res, next) => next(),
    aiTestLimiter:  (req, res, next) => next(),
}));

jest.mock('../services/db', () => ({
    generateSqlDump:    jest.fn(),
    restoreFromSqlDump: jest.fn(),
    logEvent:           jest.fn().mockResolvedValue(),
    getDbPath:          jest.fn().mockReturnValue('/tmp/test.db'),
    initDB:             jest.fn().mockResolvedValue({ get: jest.fn().mockResolvedValue() }),
}));

jest.mock('../services/ai-service', () => ({
    evaluateTextAnswer: jest.fn().mockResolvedValue({ score: 8, justification: 'good answer' }),
}));

jest.mock('../services/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

jest.mock('../config', () => ({
    appMode:        'production',
    aiConfig:       { ollamaUrl: 'http://localhost:11434', geminiKey: null },
    ui:             { loginTitle: 'TestApp' },
    enableWhatsApp: false,
}));

const axios     = require('axios');
const aiService = require('../services/ai-service');
const systemRoutes = require('../routes/api/system');

const app = createTestApp([{ path: '/api', router: systemRoutes }]);

describe('SSRF Prevention (F16 / F25)', () => {
    beforeEach(() => jest.clearAllMocks());

    // ─── GET /api/system/ollama-models ──────────────────────────────────────────

    describe('GET /api/system/ollama-models', () => {
        it('blocks cloud-metadata IP and does NOT call axios', async () => {
            const res = await request(app)
                .get('/api/system/ollama-models?baseUrl=http://169.254.169.254/latest/meta-data');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Could not reach the Ollama endpoint.');
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('blocks RFC-1918 class-C address and does NOT call axios', async () => {
            const res = await request(app)
                .get('/api/system/ollama-models?baseUrl=http://192.168.1.1:11434');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Could not reach the Ollama endpoint.');
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('blocks RFC-1918 class-A address and does NOT call axios', async () => {
            const res = await request(app)
                .get('/api/system/ollama-models?baseUrl=http://10.0.0.1:11434');

            expect(res.status).toBe(500);
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('allows localhost and calls axios', async () => {
            axios.get.mockResolvedValue({ data: { models: [{ name: 'llama3' }] } });

            const res = await request(app)
                .get('/api/system/ollama-models?baseUrl=http://localhost:11434');

            expect(res.status).toBe(200);
            expect(axios.get).toHaveBeenCalledWith('http://localhost:11434/api/tags', { timeout: 5000 });
        });
    });

    // ─── POST /api/system/ai-test ────────────────────────────────────────────────

    describe('POST /api/system/ai-test', () => {
        const validBody = (url) => ({
            question:       'What is fire?',
            reference:      'Rapid oxidation.',
            answer:         'A chemical reaction.',
            maxPoints:      10,
            configOverride: { provider: 'ollama', ollamaUrl: url },
        });

        it('returns 400 for cloud-metadata ollama URL', async () => {
            const res = await request(app)
                .post('/api/system/ai-test')
                .send(validBody('http://169.254.169.254/'));

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/invalid ollama url/i);
            expect(aiService.evaluateTextAnswer).not.toHaveBeenCalled();
        });

        it('returns 400 for RFC-1918 ollama URL', async () => {
            const res = await request(app)
                .post('/api/system/ai-test')
                .send(validBody('http://172.20.0.1:11434'));

            expect(res.status).toBe(400);
            expect(aiService.evaluateTextAnswer).not.toHaveBeenCalled();
        });

        it('proceeds and calls evaluateTextAnswer for valid localhost URL', async () => {
            const res = await request(app)
                .post('/api/system/ai-test')
                .send(validBody('http://localhost:11434'));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(aiService.evaluateTextAnswer).toHaveBeenCalled();
        });
    });
});
