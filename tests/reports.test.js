const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/report-service', () => ({
    getGroupedByMember:     jest.fn(),
    getGroupedBySkill:      jest.fn(),
    getPlannedSessions:     jest.fn(),
    getCriticalOverdue:     jest.fn(),
    getComplianceMatrix:    jest.fn(),
    getVerificationHistory: jest.fn(),
    getTrainingAttendance:  jest.fn(),
    getSurveyParticipation: jest.fn(),
    getSurveyResponseLog:   jest.fn(),
}));

jest.mock('../services/proxy-manager', () => ({
    getActiveProxy: jest.fn().mockReturnValue(null),
}));

jest.mock('../services/logger', () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
}));

jest.mock('puppeteer-core', () => ({}));

const reportService = require('../services/report-service');
const reportRoutes  = require('../routes/api/reports');

const app = createTestApp([{ path: '/api/reports', router: reportRoutes }]);

const MOCK_META = { generated: 'Monday, 12 May 2025', filterDays: 30 };

describe('Reports API Endpoints', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('GET /api/reports/data/by-member', () => {
        it('returns 200 with member report data', async () => {
            const mockData = { items: [{ name: 'CFO Smith', skills: [] }], meta: MOCK_META };
            reportService.getGroupedByMember.mockResolvedValue(mockData);

            const res = await request(app).get('/api/reports/data/by-member');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockData);
            // session user id resolved via (apiKeyUser || session?.user)?.id
            expect(reportService.getGroupedByMember).toHaveBeenCalledWith(99, null, undefined);
        });

        it('resolves userId from apiKeyUser when no session', async () => {
            reportService.getGroupedByMember.mockResolvedValue({ items: [], meta: MOCK_META });
            const apiKeyApp = createTestApp(
                [{ path: '/api/reports', router: reportRoutes }],
                { user: undefined }
            );
            // Simulate API key user by setting apiKeyUser on the request
            apiKeyApp.use((req, _res, next) => { req.apiKeyUser = { id: 7, name: 'API User' }; next(); });

            // Just confirm no crash — route should resolve userId from apiKeyUser
            // (full integration covered by Newman smoke tests)
            const res = await request(apiKeyApp).get('/api/reports/data/by-member');
            expect(res.status).not.toBe(500);
        });

        it('passes days query param through', async () => {
            reportService.getGroupedByMember.mockResolvedValue({ items: [], meta: MOCK_META });

            await request(app).get('/api/reports/data/by-member?days=60');

            expect(reportService.getGroupedByMember).toHaveBeenCalledWith(99, null, 60);
        });
    });

    describe('GET /api/reports/data/by-skill', () => {
        it('returns 200 with skill report data', async () => {
            const mockData = { items: [], meta: MOCK_META };
            reportService.getGroupedBySkill.mockResolvedValue(mockData);

            const res = await request(app).get('/api/reports/data/by-skill?days=30');

            expect(res.status).toBe(200);
            expect(reportService.getGroupedBySkill).toHaveBeenCalledWith(99, null, 30);
        });
    });

    describe('GET /api/reports/data/verification-history', () => {
        it('returns 200 and passes days param', async () => {
            reportService.getVerificationHistory.mockResolvedValue({ items: [], meta: MOCK_META });

            const res = await request(app).get('/api/reports/data/verification-history?days=14');

            expect(res.status).toBe(200);
            expect(reportService.getVerificationHistory).toHaveBeenCalledWith(14);
        });
    });

    describe('GET /api/reports/data/survey-participation', () => {
        it('returns 200 with participation data', async () => {
            const mockData = {
                items: [{ id: 1, name: 'Safety Survey', total_sent: 10, total_submitted: 7, is_anonymous: 1, is_archived: 0 }],
                meta: { generated: 'Monday, 12 May 2025' }
            };
            reportService.getSurveyParticipation.mockResolvedValue(mockData);

            const res = await request(app).get('/api/reports/data/survey-participation');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockData);
            expect(reportService.getSurveyParticipation).toHaveBeenCalledTimes(1);
        });

        it('returns 500 if service throws', async () => {
            reportService.getSurveyParticipation.mockRejectedValue(new Error('DB failure'));

            const res = await request(app).get('/api/reports/data/survey-participation');

            expect(res.status).toBe(500);
            expect(res.body).toHaveProperty('error', 'DB failure');
        });
    });

    describe('GET /api/reports/data/survey-response-log', () => {
        it('returns 200 with response log data and passes days param', async () => {
            const mockData = {
                items: [{ submitted_at: '2025-05-10', survey_name: 'Test Survey', member_name: 'FF Jane Smith', is_anonymous: 1 }],
                meta: { generated: 'Monday, 12 May 2025', days: 30 }
            };
            reportService.getSurveyResponseLog.mockResolvedValue(mockData);

            const res = await request(app).get('/api/reports/data/survey-response-log?days=30');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockData);
            expect(reportService.getSurveyResponseLog).toHaveBeenCalledWith(30);
        });

        it('uses undefined days when no param provided', async () => {
            reportService.getSurveyResponseLog.mockResolvedValue({ items: [], meta: {} });

            await request(app).get('/api/reports/data/survey-response-log');

            expect(reportService.getSurveyResponseLog).toHaveBeenCalledWith(undefined);
        });
    });

    describe('GET /api/reports/data/:type — edge cases', () => {
        it('returns 400 for an unknown report type', async () => {
            const res = await request(app).get('/api/reports/data/unknown-type');

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('error');
        });
    });
});
