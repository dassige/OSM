const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../config', () => ({
    appMode: 'production',
}));

jest.mock('../services/db', () => ({
    getQuizGames:      jest.fn(),
    getQuizGameById:    jest.fn(),
    createQuizGame:     jest.fn(),
    updateQuizGame:     jest.fn(),
    deleteQuizGame:     jest.fn(),
    logEvent:           jest.fn().mockResolvedValue(),
}));

// Bypass RBAC for functional testing (already proven in security.test.js)
jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));

const db = require('../services/db');
const quizRoutes = require('../routes/api/quiz');

const app = createTestApp({ path: '/api/quiz', router: quizRoutes });

describe('Quiz API Endpoints (Isolated)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const sampleQuestion = {
        id: 'fld_1', type: 'radio', description: 'What is the correct BA cylinder check interval?',
        required: true, options: ['Daily', 'Weekly', 'Monthly', 'Annually'],
        correctAnswer: 'Daily', points: 1, timeLimitSeconds: 20,
    };

    describe('GET /api/quiz/games', () => {
        it('returns 200 and an array of games', async () => {
            const mockGames = [{ id: 1, name: 'Pump Ops', game_type: 'score', enabled: true, questions: [], questionCount: 0 }];
            db.getQuizGames.mockResolvedValue(mockGames);

            const response = await request(app).get('/api/quiz/games');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockGames);
        });
    });

    describe('GET /api/quiz/games/:id', () => {
        it('returns the game when found', async () => {
            db.getQuizGameById.mockResolvedValue({ id: 1, name: 'Pump Ops' });

            const response = await request(app).get('/api/quiz/games/1');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('name', 'Pump Ops');
        });

        it('returns 404 when not found', async () => {
            db.getQuizGameById.mockResolvedValue(undefined);

            const response = await request(app).get('/api/quiz/games/999');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/quiz/games', () => {
        it('creates a game and returns its ID', async () => {
            db.createQuizGame.mockResolvedValue(5);

            const response = await request(app)
                .post('/api/quiz/games')
                .send({ name: 'Pump Ops', game_type: 'score', questions: [sampleQuestion] });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', 5);
            expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Quiz', 'Quiz Game Created', expect.objectContaining({ gameId: 5 }));
        });

        it('returns 400 when required fields are missing', async () => {
            const response = await request(app)
                .post('/api/quiz/games')
                .send({ name: 'Missing Type' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Validation Failed');
            expect(db.createQuizGame).not.toHaveBeenCalled();
        });

        it('returns 400 when a question is missing its description', async () => {
            const response = await request(app)
                .post('/api/quiz/games')
                .send({ name: 'Bad Game', game_type: 'score', questions: [{ ...sampleQuestion, description: undefined }] });

            expect(response.status).toBe(400);
            expect(db.createQuizGame).not.toHaveBeenCalled();
        });

        it('returns 400 when a radio question has no options', async () => {
            const response = await request(app)
                .post('/api/quiz/games')
                .send({ name: 'Bad Game', game_type: 'timed', questions: [{ ...sampleQuestion, options: [] }] });

            expect(response.status).toBe(400);
            expect(db.createQuizGame).not.toHaveBeenCalled();
        });
    });

    describe('PUT /api/quiz/games/:id', () => {
        it('updates an existing game and returns success', async () => {
            db.updateQuizGame.mockResolvedValue();

            const response = await request(app)
                .put('/api/quiz/games/1')
                .send({ name: 'Pump Ops Updated', game_type: 'timed', questions: [] });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(db.updateQuizGame).toHaveBeenCalledWith('1', expect.objectContaining({ name: 'Pump Ops Updated', game_type: 'timed' }));
        });
    });

    describe('GET /api/quiz/games/:id/export', () => {
        it('returns a downloadable JSON payload for an existing game', async () => {
            db.getQuizGameById.mockResolvedValue({
                id: 1, name: 'Pump Ops', description: 'desc', game_type: 'score',
                questions: [sampleQuestion], questionCount: 1,
            });

            const response = await request(app).get('/api/quiz/games/1/export');

            expect(response.status).toBe(200);
            expect(response.headers['content-disposition']).toContain('attachment');
            expect(response.body).toMatchObject({ name: 'Pump Ops', description: 'desc', game_type: 'score' });
            expect(response.body.questions).toHaveLength(1);
        });

        it('returns 404 when the game does not exist', async () => {
            db.getQuizGameById.mockResolvedValue(undefined);

            const response = await request(app).get('/api/quiz/games/999/export');

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/quiz/games/:id/toggle', () => {
        it('flips the enabled state', async () => {
            db.getQuizGameById.mockResolvedValue({ id: 1, name: 'Pump Ops', enabled: true, questions: [] });
            db.updateQuizGame.mockResolvedValue();

            const response = await request(app).patch('/api/quiz/games/1/toggle');

            expect(response.status).toBe(200);
            expect(db.updateQuizGame).toHaveBeenCalledWith('1', expect.objectContaining({ enabled: false }));
            expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Quiz', 'Quiz Game Toggled', expect.objectContaining({ newState: 'disabled' }));
        });

        it('returns 404 when the game does not exist', async () => {
            db.getQuizGameById.mockResolvedValue(undefined);

            const response = await request(app).patch('/api/quiz/games/999/toggle');

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/quiz/games/:id', () => {
        it('deletes a game and logs the event', async () => {
            db.getQuizGameById.mockResolvedValue({ id: 1, name: 'Pump Ops' });
            db.deleteQuizGame.mockResolvedValue();

            const response = await request(app).delete('/api/quiz/games/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Quiz', 'Quiz Game Deleted', expect.objectContaining({ gameId: '1', gameName: 'Pump Ops' }));
        });
    });
});
