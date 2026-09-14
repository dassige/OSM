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
    createTeamSession:              jest.fn(),
    getTeamSessions:                jest.fn(),
    getTeamSessionById:             jest.fn(),
    getTeamSessionTeams:            jest.fn(),
    updateTeamSessionArchiveStatus: jest.fn().mockResolvedValue(),
    deleteTeamSession:              jest.fn().mockResolvedValue(),
    getTeamByCode:                   jest.fn(),
    submitTeamResponse:              jest.fn().mockResolvedValue(),
    getTeamReview:                   jest.fn(),
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

const timedQuestions = [
    { id: 'tq1', type: 'radio', description: 'Timed Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', timeLimitSeconds: 20 },
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
        it('creates a session for a Score-based game and returns players', async () => {
            db.createQuizSession.mockResolvedValue({ sessionId: 1, players: [{ memberId: 1, accessCode: 'abc' }] });
            db.getQuizSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops - 2026-09-14', game_type: 'score' });
            db.getQuizSessionPlayers.mockResolvedValue([{ id: 10, member_name: 'Alice', email: 'a@b.com' }]);

            const response = await request(app)
                .post('/api/live-quiz/sessions')
                .send({ gameId: 5, memberIds: [1, 2] });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('sessionId', 1);
            expect(response.body.gameType).toBe('score');
            expect(response.body.players).toHaveLength(1);
            expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Quiz', 'Quiz Session Started', expect.objectContaining({ sessionId: 1, gameType: 'score', playersInvited: 1 }));
        });

        it('creates a session for a Timed game too (playable solo)', async () => {
            db.createQuizSession.mockResolvedValue({ sessionId: 2, players: [{ memberId: 1, accessCode: 'abc' }] });
            db.getQuizSessionById.mockResolvedValue({ id: 2, name: 'Radio Check - 2026-09-14', game_type: 'timed' });
            db.getQuizSessionPlayers.mockResolvedValue([{ id: 20, member_name: 'Alice', email: 'a@b.com' }]);

            const response = await request(app)
                .post('/api/live-quiz/sessions')
                .send({ gameId: 6, memberIds: [1] });

            expect(response.status).toBe(200);
            expect(response.body.gameType).toBe('timed');
        });

        it('returns 400 when no members are selected', async () => {
            const response = await request(app)
                .post('/api/live-quiz/sessions')
                .send({ gameId: 5, memberIds: [] });

            expect(response.status).toBe(400);
            expect(db.createQuizSession).not.toHaveBeenCalled();
        });

        it('returns 400 when the DB layer rejects an unknown game', async () => {
            db.createQuizSession.mockRejectedValue(new Error('Quiz game not found.'));

            const response = await request(app)
                .post('/api/live-quiz/sessions')
                .send({ gameId: 999, memberIds: [1] });

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/not found/);
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

    describe('GET /api/live-quiz/team-sessions', () => {
        it('returns the team session list', async () => {
            const mockSessions = [{ id: 1, name: 'Pump Ops - 2026-09-14', game_name: 'Pump Ops', total_teams: 2, total_members: 6, is_archived: false }];
            db.getTeamSessions.mockResolvedValue(mockSessions);

            const response = await request(app).get('/api/live-quiz/team-sessions');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockSessions);
        });
    });

    describe('GET /api/live-quiz/team-sessions/:id', () => {
        it('returns the session with its teams', async () => {
            db.getTeamSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops - 2026-09-14' });
            db.getTeamSessionTeams.mockResolvedValue([{ id: 10, name: 'Team Red', access_code: 'abc', members: [{ id: 1, name: 'Alice' }] }]);

            const response = await request(app).get('/api/live-quiz/team-sessions/1');

            expect(response.status).toBe(200);
            expect(response.body.teams).toHaveLength(1);
        });

        it('returns 404 when not found', async () => {
            db.getTeamSessionById.mockResolvedValue(undefined);

            const response = await request(app).get('/api/live-quiz/team-sessions/999');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/live-quiz/team-sessions', () => {
        it('creates a team session for a Timed game and returns the teams', async () => {
            db.createTeamSession.mockResolvedValue({
                teamSessionId: 1, sessionName: 'Pump Ops - 2026-09-14', gameType: 'timed',
                teams: [{ teamId: 10, name: 'Team Red', accessCode: 'abc', memberCount: 2 }, { teamId: 11, name: 'Team Blue', accessCode: 'def', memberCount: 2 }],
            });

            const response = await request(app)
                .post('/api/live-quiz/team-sessions')
                .send({ gameId: 5, teams: [{ name: 'Team Red', memberIds: [1, 2] }, { name: 'Team Blue', memberIds: [3, 4] }] });

            expect(response.status).toBe(200);
            expect(response.body.teams).toHaveLength(2);
            expect(response.body.gameType).toBe('timed');
            expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Quiz', 'Quiz Team Session Created', expect.objectContaining({ teamSessionId: 1, gameType: 'timed', teamCount: 2 }));
        });

        it('creates a team session for a Score-based game', async () => {
            db.createTeamSession.mockResolvedValue({
                teamSessionId: 2, sessionName: 'Radio Check - 2026-09-14', gameType: 'score',
                teams: [{ teamId: 20, name: 'Team Red', accessCode: 'ghi', memberCount: 2 }, { teamId: 21, name: 'Team Blue', accessCode: 'jkl', memberCount: 2 }],
            });

            const response = await request(app)
                .post('/api/live-quiz/team-sessions')
                .send({ gameId: 6, teams: [{ name: 'Team Red', memberIds: [1, 2] }, { name: 'Team Blue', memberIds: [3, 4] }] });

            expect(response.status).toBe(200);
            expect(response.body.gameType).toBe('score');
        });

        it('returns 400 when the DB layer rejects invalid team data', async () => {
            db.createTeamSession.mockRejectedValue(new Error('At least 2 teams are required.'));

            const response = await request(app)
                .post('/api/live-quiz/team-sessions')
                .send({ gameId: 5, teams: [{ name: 'A', memberIds: [1] }] });

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/2 teams/);
        });

        it('returns 400 when teams is missing', async () => {
            const response = await request(app)
                .post('/api/live-quiz/team-sessions')
                .send({ gameId: 5 });

            expect(response.status).toBe(400);
            expect(db.createTeamSession).not.toHaveBeenCalled();
        });
    });

    describe('PUT /api/live-quiz/team-sessions/:id/archive', () => {
        it('archives a team session', async () => {
            db.getTeamSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops' });

            const response = await request(app)
                .put('/api/live-quiz/team-sessions/1/archive')
                .send({ is_archived: true });

            expect(response.status).toBe(200);
            expect(db.updateTeamSessionArchiveStatus).toHaveBeenCalledWith('1', true);
        });
    });

    describe('DELETE /api/live-quiz/team-sessions/:id', () => {
        it('deletes a team session', async () => {
            db.getTeamSessionById.mockResolvedValue({ id: 1, name: 'Pump Ops' });

            const response = await request(app).delete('/api/live-quiz/team-sessions/1');

            expect(response.status).toBe(200);
            expect(db.deleteTeamSession).toHaveBeenCalledWith('1');
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

        it('passes through the game type so the client can render the timed play UI', async () => {
            db.getQuizPlayerByCode.mockResolvedValue({
                status: 'sent', is_archived: false, session_name: 'Radio Check - 2026-09-14',
                member_name: 'Alice', member_rank: null, member_first_name: null, member_last_name: null,
                snapshot: { description: '', game_type: 'timed', questions: timedQuestions },
            });

            const response = await request(app).get('/api/live-quiz/play/abc123');

            expect(response.status).toBe(200);
            expect(response.body.gameType).toBe('timed');
        });
    });

    describe('POST /api/live-quiz/play/:code/submit', () => {
        it('scores a Score-based submission and marks it submitted', async () => {
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

        it('scores a Timed submission on speed + correctness, not a flat point value', async () => {
            db.getQuizPlayerByCode.mockResolvedValue({
                status: 'sent', is_archived: false,
                snapshot: { game_type: 'timed', questions: timedQuestions },
            });

            const response = await request(app)
                .post('/api/live-quiz/play/abc123/submit')
                .send({ tq1: { answer: 'A', timeTakenMs: 0 } });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true, achievedScore: 1000, maxScore: 1000 });
            expect(db.submitQuizPlayerResponse).toHaveBeenCalledWith('abc123', { tq1: { answer: 'A', timeTakenMs: 0 } }, 1000, 1000);
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

    describe('GET /api/live-quiz/team-play/:code', () => {
        it('returns the questions for a pending Score-based team', async () => {
            db.getTeamByCode.mockResolvedValue({
                status: 'pending', is_archived: false, game_type: 'score', session_name: 'Radio Check - 2026-09-14',
                name: 'Team Red', snapshot: { description: 'Have fun!', questions: sampleQuestions },
            });

            const response = await request(app).get('/api/live-quiz/team-play/abc123');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('sent');
            expect(response.body.team).toBe('Team Red');
            expect(response.body.questions).toEqual(sampleQuestions);
        });

        it('returns the stored score when already submitted', async () => {
            db.getTeamByCode.mockResolvedValue({ status: 'submitted', achieved_score: 2, max_score: 2 });

            const response = await request(app).get('/api/live-quiz/team-play/abc123');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: 'submitted', achievedScore: 2, maxScore: 2 });
        });

        it('returns the questions for a pending Timed team, with the game type passed through', async () => {
            db.getTeamByCode.mockResolvedValue({
                status: 'pending', is_archived: false, game_type: 'timed', session_name: 'Radio Check - 2026-09-14',
                name: 'Team Red', snapshot: { description: '', questions: timedQuestions },
            });

            const response = await request(app).get('/api/live-quiz/team-play/abc123');

            expect(response.status).toBe(200);
            expect(response.body.gameType).toBe('timed');
            expect(response.body.questions).toEqual(timedQuestions);
        });

        it('returns 404 for an invalid code', async () => {
            db.getTeamByCode.mockResolvedValue(undefined);

            const response = await request(app).get('/api/live-quiz/team-play/nope');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/live-quiz/team-play/:code/submit', () => {
        it('scores a Score-based submission and attributes it to the team', async () => {
            db.getTeamByCode.mockResolvedValue({
                status: 'pending', is_archived: false, game_type: 'score', team_session_id: 1, name: 'Team Red',
                snapshot: { questions: sampleQuestions },
            });

            const response = await request(app)
                .post('/api/live-quiz/team-play/abc123/submit')
                .send({ fld_1: 'A' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true, achievedScore: 2, maxScore: 2 });
            expect(db.submitTeamResponse).toHaveBeenCalledWith('abc123', { fld_1: 'A' }, 2, 2);
        });

        it('scores a Timed team submission on speed + correctness', async () => {
            db.getTeamByCode.mockResolvedValue({
                status: 'pending', is_archived: false, game_type: 'timed', team_session_id: 1, name: 'Team Red',
                snapshot: { questions: timedQuestions },
            });

            const response = await request(app)
                .post('/api/live-quiz/team-play/abc123/submit')
                .send({ tq1: { answer: 'A', timeTakenMs: 20000 } });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true, achievedScore: 500, maxScore: 1000 });
            expect(db.submitTeamResponse).toHaveBeenCalledWith('abc123', { tq1: { answer: 'A', timeTakenMs: 20000 } }, 500, 1000);
        });

        it('returns 400 when already submitted', async () => {
            db.getTeamByCode.mockResolvedValue({ status: 'submitted' });

            const response = await request(app)
                .post('/api/live-quiz/team-play/abc123/submit')
                .send({ fld_1: 'A' });

            expect(response.status).toBe(400);
            expect(db.submitTeamResponse).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/live-quiz/teams/:teamId/review', () => {
        it('returns the submitted questions, answers, and score for a team', async () => {
            db.getTeamReview.mockResolvedValue({
                status: 'submitted', session_name: 'Radio Check - 2026-09-14', name: 'Team Red',
                achieved_score: 2, max_score: 2, submitted_at: '2026-09-15 03:00:00',
                snapshot: { questions: sampleQuestions }, answers: { fld_1: 'A' },
            });

            const response = await request(app).get('/api/live-quiz/teams/10/review');

            expect(response.status).toBe(200);
            expect(response.body.teamName).toBe('Team Red');
            expect(response.body.questions).toEqual(sampleQuestions);
        });

        it('returns 400 when the team has not submitted yet', async () => {
            db.getTeamReview.mockResolvedValue({ status: 'pending' });

            const response = await request(app).get('/api/live-quiz/teams/10/review');

            expect(response.status).toBe(400);
        });

        it('returns 404 for an unknown team', async () => {
            db.getTeamReview.mockResolvedValue(undefined);

            const response = await request(app).get('/api/live-quiz/teams/999/review');

            expect(response.status).toBe(404);
        });
    });
});
