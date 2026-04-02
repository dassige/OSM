// tests/live-forms.test.js
const request = require('supertest');
const { createTestApp } = require('./test-utils');

// --- 1. MOCK DEPENDENCIES ---
jest.mock('../services/db', () => ({
    logEvent: jest.fn().mockResolvedValue(),
    // The submit route manually updates the DB on a "retry", so we mock the SQLite connection
    initDB: jest.fn().mockResolvedValue({ run: jest.fn().mockResolvedValue() }) 
}));

jest.mock('../services/forms-service', () => ({
    getLiveForms: jest.fn(),
    setArchiveStatus: jest.fn().mockResolvedValue(),
    updateLiveFormStatus: jest.fn().mockResolvedValue(),
    getLiveFormByCode: jest.fn(),
    submitLiveForm: jest.fn().mockResolvedValue(),
    calculateFormScore: jest.fn(),
    incrementTries: jest.fn().mockResolvedValue() 
}));

// We mock config since the submit/accept routes check app modes and AI settings
jest.mock('../config', () => ({
    appMode: 'testing',
    ui: { loginTitle: 'Test App' },
    aiConfig: { enabled: false }
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next() 
}));

const formsService = require('../services/forms-service');
const liveFormRoutes = require('../routes/api/live-forms');

// --- 2. BUILD THE ISOLATED APP ---
const app = createTestApp({ path: '/api/live-forms', router: liveFormRoutes });

// --- 3. RUN TESTS ---
describe('Live Forms API Endpoints (Isolated)', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/live-forms (Admin Data Table)', () => {
        it('should fetch forms and correctly pass pagination and filter parameters to the service', async () => {
            // Setup mock return
            const mockReturn = { total: 100, records: [{ id: 1, skill_name: 'Driving' }] };
            formsService.getLiveForms.mockResolvedValue(mockReturn);

            // Execute request with query parameters
            const response = await request(app).get('/api/live-forms?status=accepted&page=2&limit=50');

            expect(response.status).toBe(200);
            expect(response.body.records.length).toBe(1);
            expect(response.body.page).toBe(2);
            expect(response.body.limit).toBe(50);
            
            // Verify the router parsed and passed the correct filters to the service
            expect(formsService.getLiveForms).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'accepted' }), // Filters object
                { limit: 50, offset: 50 } // Pagination object: (page 2 - 1) * 50 = offset 50
            );
        });
    });

    describe('PUT /api/live-forms/:id (Status & Archiving)', () => {
        it('should update the archive status of a form', async () => {
            const response = await request(app)
                .put('/api/live-forms/99')
                .send({ isArchived: true });

            expect(response.status).toBe(200);
            expect(formsService.setArchiveStatus).toHaveBeenCalledWith("99", true);
        });
    });

    describe('GET /api/live-forms/access/:code (Public Form Access)', () => {
        it('should return 404 if the form code is invalid', async () => {
            formsService.getLiveFormByCode.mockResolvedValue(null);
            
            const response = await request(app).get('/api/live-forms/access/INVALID_CODE');
            expect(response.status).toBe(404);
            expect(response.body.error).toMatch(/invalid or expired/);
        });

        it('should return 403 Forbidden if the form has already been submitted', async () => {
            formsService.getLiveFormByCode.mockResolvedValue({ 
                form_status: 'accepted', // Already completed
                member_name: 'Test Member'
            });

            const response = await request(app).get('/api/live-forms/access/VALID_CODE');
            expect(response.status).toBe(403);
            expect(response.body.error).toMatch(/already submitted/);
        });

        it('should return 200 and the form structure if the form is open (sent)', async () => {
            formsService.getLiveFormByCode.mockResolvedValue({ 
                form_status: 'sent',
                form_name: 'Driving Test',
                structure: '[]',
                member_name: 'John Doe',
                skill_name: 'Driving'
            });

            const response = await request(app).get('/api/live-forms/access/VALID_CODE');
            expect(response.status).toBe(200);
            expect(response.body.name).toBe('Driving Test');
        });
    });

    describe('POST /api/live-forms/submit/:code (Public Form Submission)', () => {
        it('should accept the form if the score meets the percentage threshold', async () => {
            // 1. Mock the open form
            formsService.getLiveFormByCode.mockResolvedValue({ 
                id: 5,
                form_status: 'sent',
                min_score: 80, 
                min_score_type: 'percentage',
                tries: 1,
                max_tries: 3
            });

            // 2. Mock the grading AI/Engine returning a passing score (90%)
            formsService.calculateFormScore.mockResolvedValue({
                achieved: 9,
                maximum: 10,
                feedback: {}
            });

            const response = await request(app)
                .post('/api/live-forms/submit/VALID_CODE')
                .send({ "q1": "answer" });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('accepted');
            expect(response.body.score).toBe(9);
            
            // Prove the router updated the DB state to 'accepted'
            expect(formsService.updateLiveFormStatus).toHaveBeenCalledWith(5, 'accepted', 9, {});
        });

        it('should force a retry (400) if the score is too low and max_tries is not reached', async () => {
            // 1. Mock the open form
            formsService.getLiveFormByCode.mockResolvedValue({ 
                id: 5,
                form_status: 'sent',
                min_score: 80, 
                min_score_type: 'percentage',
                tries: 1, // Only on first try
                max_tries: 3
            });

            // 2. Mock the grading engine returning a failing score (50%)
            formsService.calculateFormScore.mockResolvedValue({
                achieved: 5,
                maximum: 10,
                feedback: {}
            });

            const response = await request(app)
                .post('/api/live-forms/submit/VALID_CODE')
                .send({ "q1": "bad answer" });

            // Expect a 400 Bad Request instructing the user to retry
            expect(response.status).toBe(400);
            expect(response.body.status).toBe('retry');
            expect(response.body.currentTry).toBe(1);
        });
    });
});