const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/extraction-engine', () => ({
    extractData:     jest.fn().mockResolvedValue([]),
    clearCache:      jest.fn(),
    getActivePlugin: jest.fn().mockReturnValue({ name: 'html-scraper', description: 'Test' }),
}));

jest.mock('../services/proxy-manager', () => ({
    getActiveProxy: jest.fn().mockReturnValue(null),
}));

jest.mock('../services/db', () => ({
    getSkills:             jest.fn(),
    getSkillsPage:         jest.fn(),
    addSkill:              jest.fn(),
    updateSkill:           jest.fn(),
    getSkillById:          jest.fn().mockResolvedValue({ name: 'Test Skill' }),
    deleteSkill:           jest.fn(),
    bulkDeleteSkills:      jest.fn(),
    bulkAddSkills:         jest.fn(),
    bulkAddSkillsWithEtl:  jest.fn().mockResolvedValue(),
    updateSkillEtlFields:  jest.fn().mockResolvedValue(),
    logEvent:              jest.fn().mockResolvedValue(),
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
        it('should return 200 and a plain array when no limit param is given', async () => {
            const mockData = [
                { id: 1, name: 'First Aid', url_type: 'internal', url: 'http://form.local/fa' },
                { id: 2, name: 'Driving', url_type: 'none', url: null }
            ];
            db.getSkills.mockResolvedValue(mockData);

            const response = await request(app).get('/api/skills');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockData);
            expect(db.getSkills).toHaveBeenCalledTimes(1);
            expect(db.getSkillsPage).not.toHaveBeenCalled();
        });

        it('should return a paginated wrapper when limit param is provided', async () => {
            const mockPage = { items: [{ id: 1, name: 'First Aid' }], total: 8, limit: 5, offset: 0 };
            db.getSkillsPage.mockResolvedValue(mockPage);

            const response = await request(app).get('/api/skills?limit=5&offset=0');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockPage);
            expect(db.getSkillsPage).toHaveBeenCalledWith({ limit: 5, offset: 0, search: undefined, sortBy: undefined, sortDir: undefined });
            expect(db.getSkills).not.toHaveBeenCalled();
        });

        it('should pass search and sort params to getSkillsPage', async () => {
            db.getSkillsPage.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 });

            await request(app).get('/api/skills?limit=10&search=Aid&sortBy=url_type&sortDir=asc');

            expect(db.getSkillsPage).toHaveBeenCalledWith({ limit: 10, offset: 0, search: 'Aid', sortBy: 'url_type', sortDir: 'asc' });
        });
    });

    describe('POST /api/skills', () => {
        it('should add a new skill and return 200 with the new ID', async () => {
            db.addSkill.mockResolvedValue(5);

            const response = await request(app)
                .post('/api/skills')
                .send({
                    name: 'Breathing Apparatus',
                    url_type: 'internal',
                    url: 'http://fenz.osm/ba-form',
                    critical_skill: 1,
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', 5);
            // Joi.alternatives().try() uses strict matching; number 1 stays as 1 (not coerced to boolean)
            expect(db.addSkill).toHaveBeenCalledWith({
                name: 'Breathing Apparatus',
                url_type: 'internal',
                url: 'http://fenz.osm/ba-form',
                critical_skill: 1,
            });
        });

        it('should return 400 when required fields are missing', async () => {
            const response = await request(app)
                .post('/api/skills')
                .send({ name: 'Missing URL Type' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Validation Failed');
            expect(response.body).toHaveProperty('details');
            expect(db.addSkill).not.toHaveBeenCalled();
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

    describe('GET /api/skills/discover', () => {
        const extractionEngine = require('../services/extraction-engine');

        it('returns new and changed skills with correct shape', async () => {
            extractionEngine.extractData.mockResolvedValue([
                { name: 'FF Solo, H', rank: 'FF', lastName: 'Solo', firstName: 'H', memberOsmId: 'FF Solo, H', skill: 'First Aid',   skillOsmId: 'First Aid',   skillCategory: 'First Aid', dueDate: '2026-01-01' },
                { name: 'FF Solo, H', rank: 'FF', lastName: 'Solo', firstName: 'H', memberOsmId: 'FF Solo, H', skill: 'New Skill X', skillOsmId: 'New Skill X', skillCategory: 'General',   dueDate: '2026-01-01' },
            ]);
            // First Aid is in DB with wrong category; New Skill X is genuinely new
            db.getSkills.mockResolvedValue([
                { id: 1, name: 'First Aid', skill_osm_id: 'First Aid', skill_category: 'Medical' },
            ]);

            const response = await request(app).get('/api/skills/discover');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('new');
            expect(response.body).toHaveProperty('changed');
            expect(response.body.new).toHaveLength(1);
            expect(response.body.new[0].skill).toBe('New Skill X');
            expect(response.body.changed).toHaveLength(1);
            expect(response.body.changed[0].dbId).toBe(1);
            expect(response.body.changed[0].skillCategory).toBe('First Aid');
            expect(response.body.changed[0].currentSkillCategory).toBe('Medical');
        });
    });

    describe('POST /api/skills/sync', () => {
        it('adds new and updates changed skills, returns counts', async () => {
            const response = await request(app)
                .post('/api/skills/sync')
                .send({
                    add:    [{ skill: 'New Skill X', skillOsmId: 'New Skill X', skillCategory: 'General' }],
                    update: [{ dbId: 1, skillOsmId: 'First Aid', skillCategory: 'First Aid' }],
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ success: true, added: 1, updated: 1 });
            expect(db.bulkAddSkillsWithEtl).toHaveBeenCalledTimes(1);
            expect(db.updateSkillEtlFields).toHaveBeenCalledWith(1, expect.objectContaining({ skillCategory: 'First Aid' }));
        });
    });
});