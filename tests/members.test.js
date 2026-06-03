const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/extraction-engine', () => ({
    extractData: jest.fn().mockResolvedValue([]),
    clearCache:  jest.fn(),
    getActivePlugin: jest.fn().mockReturnValue({ name: 'html-scraper', description: 'Test' }),
}));

jest.mock('../services/proxy-manager', () => ({
    getActiveProxy: jest.fn().mockReturnValue(null),
}));

jest.mock('../services/db', () => ({
    getMembers:             jest.fn(),
    getMembersPage:         jest.fn(),
    addMember:              jest.fn(),
    getMemberById:          jest.fn().mockResolvedValue({ name: 'Test Member' }),
    deleteMember:           jest.fn(),
    bulkDeleteMembers:      jest.fn(),
    bulkAddMembers:         jest.fn(),
    bulkAddMembersWithEtl:  jest.fn().mockResolvedValue(),
    updateMemberEtlFields:  jest.fn().mockResolvedValue(),
    logEvent:               jest.fn().mockResolvedValue(),
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));

const db = require('../services/db');
const memberRoutes = require('../routes/api/members');

const app = createTestApp(   [
        { path: '/api/members', router: memberRoutes }
    ]);


describe('Members API Endpoints (Isolated)', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/members', () => {
        it('should return 200 and a plain array when no limit param is given', async () => {
            const mockData = [
                { id: 1, name: 'CFO John Doe', email: 'john@fenz.osm' },
                { id: 2, name: 'FF Jane Smith', email: 'jane@fenz.osm' }
            ];
            db.getMembers.mockResolvedValue(mockData);

            const response = await request(app).get('/api/members');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockData);
            expect(db.getMembers).toHaveBeenCalledTimes(1);
            expect(db.getMembersPage).not.toHaveBeenCalled();
        });

        it('should return a paginated wrapper when limit param is provided', async () => {
            const mockPage = { items: [{ id: 1, name: 'CFO John Doe' }], total: 10, limit: 5, offset: 0 };
            db.getMembersPage.mockResolvedValue(mockPage);

            const response = await request(app).get('/api/members?limit=5&offset=0');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockPage);
            expect(db.getMembersPage).toHaveBeenCalledWith({ limit: 5, offset: 0, search: undefined, sortBy: undefined, sortDir: undefined });
            expect(db.getMembers).not.toHaveBeenCalled();
        });

        it('should pass search and sort params to getMembersPage', async () => {
            db.getMembersPage.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 });

            await request(app).get('/api/members?limit=10&search=John&sortBy=email&sortDir=desc');

            expect(db.getMembersPage).toHaveBeenCalledWith({ limit: 10, offset: 0, search: 'John', sortBy: 'email', sortDir: 'desc' });
        });
    });

    describe('POST /api/members', () => {
        it('should add a member and return 200 with the new ID', async () => {
            db.addMember.mockResolvedValue(3);

            const response = await request(app)
                .post('/api/members')
                .send({
                    name: 'SO Bob Builder',
                    email: 'bob@fenz.osm',
                    mobile: '021123456',
                    notificationPreference: 'email',
                    enabled: true,
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', 3);
            expect(db.addMember).toHaveBeenCalledWith({
                name: 'SO Bob Builder',
                email: 'bob@fenz.osm',
                mobile: '021123456',
                notificationPreference: 'email',
                enabled: true,
            });
        });

        it('should return 400 when name is missing', async () => {
            const response = await request(app)
                .post('/api/members')
                .send({ email: 'noname@test.com', notificationPreference: 'email' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Validation Failed');
            expect(response.body).toHaveProperty('details');
            expect(db.addMember).not.toHaveBeenCalled();
        });
    });

    describe('DELETE /api/members/:id', () => {
        it('should delete a member and return success', async () => {
            db.deleteMember.mockResolvedValue();

            const response = await request(app).delete('/api/members/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(db.deleteMember).toHaveBeenCalledWith("1");
        });
    });

    describe('GET /api/members/discover', () => {
        const extractionEngine = require('../services/extraction-engine');

        it('returns new and changed members with correct shape', async () => {
            extractionEngine.extractData.mockResolvedValue([
                { name: 'QFF Smith, J',  rank: 'QFF', lastName: 'Smith',  firstName: 'J', memberOsmId: 'QFF Smith, J',  skill: 'First Aid', skillOsmId: 'First Aid', skillCategory: 'First Aid', dueDate: '2026-01-01' },
                { name: 'FF Jones, T',   rank: 'FF',  lastName: 'Jones',  firstName: 'T', memberOsmId: 'FF Jones, T',   skill: 'Driving',   skillOsmId: 'Driving',    skillCategory: 'Vehicle & Appliance', dueDate: '2026-01-01' },
            ]);
            // Smith is in DB but ETL fields are null (changed); Jones is new
            db.getMembers.mockResolvedValue([
                { id: 1, name: 'QFF Smith, J', member_osm_id: 'QFF Smith, J', rank: null, first_name: null, last_name: null },
            ]);

            const response = await request(app).get('/api/members/discover');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('new');
            expect(response.body).toHaveProperty('changed');
            expect(response.body.new).toHaveLength(1);
            expect(response.body.new[0].name).toBe('FF Jones, T');
            expect(response.body.changed).toHaveLength(1);
            expect(response.body.changed[0].dbId).toBe(1);
            expect(response.body.changed[0].rank).toBe('QFF');
        });

        it('returns empty new and changed when everything matches', async () => {
            extractionEngine.extractData.mockResolvedValue([
                { name: 'QFF Smith, J', rank: 'QFF', lastName: 'Smith', firstName: 'J', memberOsmId: 'QFF Smith, J', skill: 'First Aid', skillOsmId: 'First Aid', skillCategory: 'First Aid', dueDate: '2026-01-01' },
            ]);
            db.getMembers.mockResolvedValue([
                { id: 1, name: 'QFF Smith, J', member_osm_id: 'QFF Smith, J', rank: 'QFF', first_name: 'J', last_name: 'Smith' },
            ]);

            const response = await request(app).get('/api/members/discover');

            expect(response.status).toBe(200);
            expect(response.body.new).toHaveLength(0);
            expect(response.body.changed).toHaveLength(0);
        });
    });

    describe('POST /api/members/sync', () => {
        it('adds new and updates changed members, returns counts', async () => {
            const response = await request(app)
                .post('/api/members/sync')
                .send({
                    add:    [{ name: 'FF Jones, T', rank: 'FF', lastName: 'Jones', firstName: 'T', memberOsmId: 'FF Jones, T' }],
                    update: [{ dbId: 1, rank: 'QFF', lastName: 'Smith', firstName: 'J', memberOsmId: 'QFF Smith, J' }],
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ success: true, added: 1, updated: 1 });
            expect(db.bulkAddMembersWithEtl).toHaveBeenCalledTimes(1);
            expect(db.updateMemberEtlFields).toHaveBeenCalledWith(1, expect.objectContaining({ rank: 'QFF' }));
        });
    });
});