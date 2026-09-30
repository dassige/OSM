const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    logEvent: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/forms-service', () => ({
    calculateFormScore: jest.fn(),
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 },
}));

jest.mock('../middleware/validation', () => ({
    validateForm:     (req, res, next) => next(),
    validateBulkData: (req, res, next) => next(),
}));

jest.mock('../middleware/rate-limiter', () => ({
    aiTestLimiter: (req, res, next) => next(),
}));

jest.mock('../services/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

jest.mock('../config', () => ({
    appMode:  'production',
    aiConfig: { enabled: true, provider: 'jev' },
}));

const db = require('../services/db');
const config = require('../config');
const formsService = require('../services/forms-service');
const formRoutes = require('../routes/api/forms');

const app = createTestApp({ path: '/api/forms', router: formRoutes });

const structure = [
    { id: 'q1', type: 'radio', points: '1', options: ['A', 'B'], correctAnswer: 'A' },
    { id: 'q2', type: 'text_multi', points: '3', correctAnswer: 'Reference', description: 'Explain' },
];

describe('POST /api/forms/test-score (Scoring Simulator)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        config.aiConfig.enabled = true;
    });

    it('scores with AI when evaluation is enabled and stores nothing', async () => {
        formsService.calculateFormScore.mockResolvedValue({
            achieved: 3.5, maximum: 4,
            feedback: { q2: { score: 2.5, reason: 'Closest match: "Mostly correct"', reviewSuggested: true } },
        });

        const res = await request(app)
            .post('/api/forms/test-score')
            .send({ structure, answers: { q1: 'A', q2: 'My answer' } });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            achieved: 3.5, maximum: 4, aiEnabled: true,
            feedback: { q2: { score: 2.5, reason: 'Closest match: "Mostly correct"', reviewSuggested: true } },
        });
        // third argument is skipAi
        expect(formsService.calculateFormScore).toHaveBeenCalledWith(structure, { q1: 'A', q2: 'My answer' }, false);
        expect(db.logEvent).not.toHaveBeenCalled();
    });

    it('skips AI when evaluation is disabled', async () => {
        config.aiConfig.enabled = false;
        formsService.calculateFormScore.mockResolvedValue({ achieved: 1, maximum: 4, feedback: {} });

        const res = await request(app)
            .post('/api/forms/test-score')
            .send({ structure, answers: { q1: 'A' } });

        expect(res.status).toBe(200);
        expect(res.body.aiEnabled).toBe(false);
        expect(formsService.calculateFormScore).toHaveBeenCalledWith(structure, { q1: 'A' }, true);
    });

    it('returns 400 for an empty structure', async () => {
        const res = await request(app)
            .post('/api/forms/test-score')
            .send({ structure: [], answers: {} });

        expect(res.status).toBe(400);
        expect(formsService.calculateFormScore).not.toHaveBeenCalled();
    });

    it('returns 400 for more than 200 questions', async () => {
        const big = Array.from({ length: 201 }, (_, i) => ({ id: `q${i}`, type: 'radio', points: '1' }));
        const res = await request(app)
            .post('/api/forms/test-score')
            .send({ structure: big, answers: {} });

        expect(res.status).toBe(400);
    });

    it('returns 400 when answers is not an object', async () => {
        const res = await request(app)
            .post('/api/forms/test-score')
            .send({ structure, answers: ['A'] });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/answers/);
    });

    it('returns 500 when scoring throws', async () => {
        formsService.calculateFormScore.mockRejectedValue(new Error('boom'));

        const res = await request(app)
            .post('/api/forms/test-score')
            .send({ structure, answers: { q1: 'A' } });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('boom');
    });
});
