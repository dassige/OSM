const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../config', () => ({
    appMode: 'production',
    transporter: {},
    ui: { loginTitle: 'OpReady' },
}));

jest.mock('../services/db', () => ({
    getQuizSessions:               jest.fn(),
    getQuizSessionById:            jest.fn(),
    getQuizSessionPlayers:         jest.fn(),
    createQuizSession:             jest.fn(),
    getQuizPlayerById:             jest.fn(),
    getQuizPlayerByCode:           jest.fn(),
    getQuizPlayerReview:           jest.fn(),
    submitQuizPlayerResponse:      jest.fn().mockResolvedValue(),
    updateQuizSessionArchiveStatus: jest.fn().mockResolvedValue(),
    deleteQuizSession:             jest.fn().mockResolvedValue(),
    getPreferences:                jest.fn().mockResolvedValue({}),
    logEvent:                      jest.fn().mockResolvedValue(),
}));

jest.mock('../services/mailer', () => ({
    sendQuizInvitation: jest.fn().mockResolvedValue(),
}));

// Bypass RBAC and rate limiting for functional testing
jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));
jest.mock('../middleware/rate-limiter', () => ({
    publicSubmitLimiter: (req, res, next) => next(),
    apiLimiter: (req, res, next) => next(),
    loginLimiter: (req, res, next) => next(),
}));

const db = require('../services/db');
const mailer = require('../services/mailer');
const liveQuizRoutes = require('../routes/api/live-quiz');

const app = createTestApp({ path: '/api/live-quiz', router: liveQuizRoutes });

const sampleQuestions = [
    { id: 'fld_1', type: 'radio', description: 'Q1', required: true, options: ['A', 'B'], correctAnswer: 'A', points: 2 },
];

describe('Live Quiz API Endpoints (Isolated)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/live-quiz/sessions', () => {
        it('returns the session list', async () => {
            const mockSessions = [{ id: 1, name: 'Pump Ops - 2026-09-14', game_name: 'Pump Ops', total_sent: 5, total_submitted: 2, is_archived: false }];
            db.getQuizSessions.mockResolvedValue(mockSessions);

            const response = await request(app).get('/api/live-quiz/sessions');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockSessions);
        });
    });

    describe('POST /api/live-quiz/sessions', () => {
        it('creates a session and returns players', async () => {
            db.createQuizSession.mockResolvedValue({ sessionId: 1, players: [{ memberId: 1, accessCode: 'abc' }] });
            db.getQuizSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops - 2026-09-14' });
            db.getQuizSessionPlayers.mockResolvedValue([{ id: 10, member_name: 'Alice', email: 'a@b.com' }]);

            const response = await request(app)
                .post('/api/live-quiz/sessions')
                .send({ gameId: 5, memberIds: [1, 2] });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('sessionId', 1);
            expect(response.body.players).toHaveLength(1);
            expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Quiz', 'Quiz Session Started', expect.objectContaining({ sessionId: 1, playersInvited: 1 }));
        });

        it('returns 400 when no members are selected', async () => {
            const response = await request(app)
                .post('/api/live-quiz/sessions')
                .send({ gameId: 5, memberIds: [] });

            expect(response.status).toBe(400);
            expect(db.createQuizSession).not.toHaveBeenCalled();
        });

        it('returns 400 when the DB layer rejects a timed game', async () => {
            db.createQuizSession.mockRejectedValue(new Error('Only Score-based games can be played this way'));

            const response = await request(app)
                .post('/api/live-quiz/sessions')
                .send({ gameId: 5, memberIds: [1] });

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/Score-based/);
        });
    });

    describe('POST /api/live-quiz/sessions/:id/players/:playerId/send', () => {
        it('sends the invitation email', async () => {
            db.getQuizSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops - 2026-09-14' });
            db.getQuizPlayerById.mockResolvedValue({ id: 10, email: 'a@b.com', member_name: 'Alice' });

            const response = await request(app).post('/api/live-quiz/sessions/1/players/10/send');

            expect(response.status).toBe(200);
            expect(mailer.sendQuizInvitation).toHaveBeenCalledTimes(1);
        });

        it('returns 400 when the player has no email', async () => {
            db.getQuizSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops' });
            db.getQuizPlayerById.mockResolvedValue({ id: 10, email: null });

            const response = await request(app).post('/api/live-quiz/sessions/1/players/10/send');

            expect(response.status).toBe(400);
            expect(mailer.sendQuizInvitation).not.toHaveBeenCalled();
        });
    });

    describe('PUT /api/live-quiz/sessions/:id/archive', () => {
        it('archives a session', async () => {
            db.getQuizSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops' });

            const response = await request(app)
                .put('/api/live-quiz/sessions/1/archive')
                .send({ is_archived: true });

            expect(response.status).toBe(200);
            expect(db.updateQuizSessionArchiveStatus).toHaveBeenCalledWith('1', true);
        });
    });

    describe('DELETE /api/live-quiz/sessions/:id', () => {
        it('deletes a session', async () => {
            db.getQuizSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops' });

            const response = await request(app).delete('/api/live-quiz/sessions/1');

            expect(response.status).toBe(200);
            expect(db.deleteQuizSession).toHaveBeenCalledWith('1');
        });
    });

    describe('GET /api/live-quiz/players/:playerId/review', () => {
        it('returns the submitted questions, answers, and score', async () => {
            db.getQuizPlayerReview.mockResolvedValue({
                status: 'submitted', session_name: 'Pump Ops - 2026-09-14',
                member_name: 'Alice', member_rank: null, member_first_name: null, member_last_name: null,
                achieved_score: 2, max_score: 2, submitted_at: '2026-09-14 03:58:03',
                snapshot: { questions: sampleQuestions }, answers: { fld_1: 'A' },
            });

            const response = await request(app).get('/api/live-quiz/players/10/review');

            expect(response.status).toBe(200);
            expect(response.body.questions).toEqual(sampleQuestions);
            expect(response.body.answers).toEqual({ fld_1: 'A' });
            expect(response.body.achievedScore).toBe(2);
        });

        it('returns 400 when the player has not submitted yet', async () => {
            db.getQuizPlayerReview.mockResolvedValue({ status: 'sent' });

            const response = await request(app).get('/api/live-quiz/players/10/review');

            expect(response.status).toBe(400);
        });

        it('returns 404 for an unknown player', async () => {
            db.getQuizPlayerReview.mockResolvedValue(undefined);

            const response = await request(app).get('/api/live-quiz/players/999/review');

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/live-quiz/play/:code', () => {
        it('returns the questions for a pending player', async () => {
            db.getQuizPlayerByCode.mockResolvedValue({
                status: 'sent', is_archived: false, session_name: 'Pump Ops - 2026-09-14',
                member_name: 'Alice', member_rank: null, member_first_name: null, member_last_name: null,
                snapshot: { description: 'Have fun!', questions: sampleQuestions },
            });

            const response = await request(app).get('/api/live-quiz/play/abc123');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('sent');
            expect(response.body.questions).toEqual(sampleQuestions);
        });

        it('returns the stored score when already submitted', async () => {
            db.getQuizPlayerByCode.mockResolvedValue({ status: 'submitted', achieved_score: 2, max_score: 2 });

            const response = await request(app).get('/api/live-quiz/play/abc123');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: 'submitted', achievedScore: 2, maxScore: 2 });
        });

        it('returns 404 for an invalid code', async () => {
            db.getQuizPlayerByCode.mockResolvedValue(undefined);

            const response = await request(app).get('/api/live-quiz/play/nope');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/live-quiz/play/:code/submit', () => {
        it('scores the submission and marks it submitted', async () => {
            db.getQuizPlayerByCode.mockResolvedValue({
                status: 'sent', is_archived: false,
                snapshot: { questions: sampleQuestions },
            });

            const response = await request(app)
                .post('/api/live-quiz/play/abc123/submit')
                .send({ fld_1: 'A' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true, achievedScore: 2, maxScore: 2 });
            expect(db.submitQuizPlayerResponse).toHaveBeenCalledWith('abc123', { fld_1: 'A' }, 2, 2);
        });

        it('returns 400 when already submitted', async () => {
            db.getQuizPlayerByCode.mockResolvedValue({ status: 'submitted' });

            const response = await request(app)
                .post('/api/live-quiz/play/abc123/submit')
                .send({ fld_1: 'A' });

            expect(response.status).toBe(400);
            expect(db.submitQuizPlayerResponse).not.toHaveBeenCalled();
        });

        it('returns 403 when the session is archived', async () => {
            db.getQuizPlayerByCode.mockResolvedValue({ status: 'sent', is_archived: true, snapshot: { questions: sampleQuestions } });

            const response = await request(app)
                .post('/api/live-quiz/play/abc123/submit')
                .send({ fld_1: 'A' });

            expect(response.status).toBe(403);
        });
    });
});
