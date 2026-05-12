const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    getSkills: jest.fn(),
    addSkill: jest.fn(),
    updateSkill: jest.fn(),
    getSkillById: jest.fn().mockResolvedValue({ name: 'Test Skill' }),
    deleteSkill: jest.fn(),
    logEvent: jest.fn().mockResolvedValue()
}));

// Bypass RBAC for functional testing (we already proved RBAC works in security.test.js!)
jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(), 
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));

const db = require('../services/db');
const skillRoutes = require('../routes/api/skills');

const app = createTestApp({ path: '/api/skills', router: skillRoutes });

describe('Skills API Endpoints (Isolated)', () => {
    
    // Reset mocks before each test so counts and data don't leak
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/skills', () => {
        it('should return 200 and an array of skills', async () => {
            const mockData = [
                { id: 1, name: 'First Aid', url_type: 'internal', url: 'http://form.local/fa' },
                { id: 2, name: 'Driving', url_type: 'none', url: null }
            ];
            db.getSkills.mockResolvedValue(mockData);

            const response = await request(app).get('/api/skills');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockData);
            expect(db.getSkills).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /api/skills', () => {
        it('should add a new skill and return 200 with the new ID', async () => {
            db.addSkill.mockResolvedValue(5);

            const newSkillPayload = {
                name: 'Breathing Apparatus',
                url_type: 'internal',
                url: 'http://fenz.osm/ba-form',
                is_critical: 1
            };

            const response = await request(app)
                .post('/api/skills')
                .send(newSkillPayload);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', 5);
            expect(db.addSkill).toHaveBeenCalledWith(newSkillPayload);
        });
    });

    describe('PUT /api/skills/:id', () => {
        it('should update an existing skill and return success', async () => {
            db.updateSkill.mockResolvedValue();

            const updatePayload = {
                url_type: 'external',
                url: 'http://external.site/form'
            };

            const response = await request(app)
                .put('/api/skills/1')
                .send(updatePayload);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            
            // Prove that the router extracted the ID from the URL and passed the payload
            expect(db.updateSkill).toHaveBeenCalledWith("1", updatePayload);
        });
    });

    describe('DELETE /api/skills/:id', () => {
        it('should delete a skill and return success', async () => {
            db.deleteSkill.mockResolvedValue();

            const response = await request(app).delete('/api/skills/2');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(db.deleteSkill).toHaveBeenCalledWith("2");
        });
    });
});