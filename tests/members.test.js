const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    getMembers: jest.fn(),
    getMembersPage: jest.fn(),
    addMember: jest.fn(),
    getMemberById: jest.fn().mockResolvedValue({ name: 'Test Member' }),
    deleteMember: jest.fn(),
    logEvent: jest.fn().mockResolvedValue()
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
});