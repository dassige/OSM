const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    getLiveSurveyInstanceById: jest.fn(),
    getSurveyResponses: jest.fn(),
    getSurveyTracking: jest.fn(),
    getAllSurveys: jest.fn(),
    importAllSurveys: jest.fn().mockResolvedValue(),
    getSurveyById: jest.fn(),
    createSurvey: jest.fn().mockResolvedValue({ id: 1, name: 'New Survey' }),
    getLiveSurveyInstances: jest.fn(),
    updateSurveyArchiveStatus: jest.fn().mockResolvedValue(),
    deleteSurveyInstance: jest.fn().mockResolvedValue(),
    updateSurvey: jest.fn().mockResolvedValue(),
    deleteSurvey: jest.fn().mockResolvedValue(),
    publishSurvey: jest.fn(),
    getPreferences: jest.fn(),
    logEvent: jest.fn().mockResolvedValue()
}));

jest.mock('../services/mailer', () => ({
    sendSurveyInvitation: jest.fn().mockResolvedValue()
}));

jest.mock('../config', () => ({
    transporter: {},
    ui: { loginTitle: 'OpReady' }
}));

jest.mock('../middleware/auth', () => ({
    // Bypass authentication and role checking for isolated routing tests
    hasRole: () => (req, res, next) => {
        req.user = { id: 1 };
        req.session = { user: { id: 1, name: 'Admin' } };
        next();
    }
}));

const db = require('../services/db');
const mailer = require('../services/mailer');
const surveysRoutes = require('../routes/api/surveys');

const app = createTestApp({ path: '/api/surveys', router: surveysRoutes });

describe('Surveys API Endpoints (Isolated)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/surveys', () => {
        it('should retrieve all survey templates', async () => {
            db.getAllSurveys.mockResolvedValue([{ id: 1, name: 'Test Template' }]);

            const response = await request(app).get('/api/surveys');
            expect(response.status).toBe(200);
            expect(response.body.length).toBe(1);
            expect(response.body[0].name).toBe('Test Template');
        });
    });

    describe('POST /api/surveys', () => {
        it('should fail if name or structure is missing', async () => {
            const response = await request(app).post('/api/surveys').send({ name: 'Only Name' });
            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/name and structure are required/);
        });

        it('should create a new survey template', async () => {
            const response = await request(app)
                .post('/api/surveys')
                .send({ name: 'New Template', structure: [] });
            
            expect(response.status).toBe(201);
            expect(db.createSurvey).toHaveBeenCalled();
            expect(db.logEvent).toHaveBeenCalledWith('Admin', 'Surveys', 'Created Survey Template', expect.any(Object));
        });
    });

    describe('POST /api/surveys/:id/publish', () => {
        it('should successfully publish a survey and return tracking data for frontend-driven invitations', async () => {
            db.publishSurvey.mockResolvedValue({
                liveInstanceId: 99,
                trackingData: [
                    { tracking_id: 1, status: 'sent', email: 'ff1@fireandemergency.nz', access_code: 'ABC', member_name: 'FF One' },
                    { tracking_id: 2, status: 'sent', email: 'ff2@fireandemergency.nz', access_code: 'DEF', member_name: 'FF Two' }
                ]
            });
            db.getSurveyTracking.mockResolvedValue([
                { tracking_id: 1, status: 'sent', email: 'ff1@fireandemergency.nz', access_code: 'ABC', member_name: 'FF One' },
                { tracking_id: 2, status: 'sent', email: 'ff2@fireandemergency.nz', access_code: 'DEF', member_name: 'FF Two' }
            ]);
            db.getLiveSurveyInstanceById.mockResolvedValue({ name: 'Annual Check - 2026', is_anonymous: 0 });

            const response = await request(app)
                .post('/api/surveys/1/publish')
                .send({ memberIds: [101, 102] });

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/published/);
            expect(response.body.liveInstanceId).toBe(99);
            expect(response.body.tracking).toHaveLength(2);
            expect(mailer.sendSurveyInvitation).not.toHaveBeenCalled();
            expect(db.logEvent).toHaveBeenCalledWith('Admin', 'Surveys', 'Published Survey', expect.any(Object));
        });

        it('should return 400 if no memberIds are provided', async () => {
            const response = await request(app)
                .post('/api/surveys/1/publish')
                .send({ memberIds: [] });

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/At least one member/);
        });
    });

    describe('POST /api/surveys/instances/:liveId/remind-all', () => {
        it('should trigger reminder emails for all pending members', async () => {
            db.getSurveyTracking.mockResolvedValue([
                { status: 'sent', email: 'ff1@test.com', access_code: '123' },
                { status: 'submitted', email: 'ff2@test.com', access_code: '456' } // Should be ignored
            ]);
            db.getLiveSurveyInstanceById.mockResolvedValue({ name: 'Live Survey', template_id: 1 });
            db.getPreferences.mockResolvedValue({});
            db.getSurveyById.mockResolvedValue({ public_id: 'abc' });

            const response = await request(app).post('/api/surveys/instances/99/remind-all');

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/triggered for 1 out of 1 pending members/);
            expect(mailer.sendSurveyInvitation).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /api/surveys/instances/:liveId/results', () => {
        it('should fetch and format survey instance results', async () => {
            db.getLiveSurveyInstanceById.mockResolvedValue({ name: 'Live Survey', structure: '[]' });
            db.getSurveyResponses.mockResolvedValue([
                { id: 1, submitted_at: '2026-01-01', submitted_data: '{"q1":"yes"}' }
            ]);
            db.getSurveyTracking.mockResolvedValue([{}, {}]); // 2 invited total

            const response = await request(app).get('/api/surveys/instances/99/results');

            expect(response.status).toBe(200);
            expect(response.body.instanceName).toBe('Live Survey');
            expect(response.body.responses.length).toBe(1);
            expect(response.body.stats.totalInvited).toBe(2);
            expect(response.body.stats.pending).toBe(1);
        });
    });
});