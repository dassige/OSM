// tests/members.test.js
const request = require('supertest');
const { createTestApp } = require('./test-utils');

// --- 1. MOCK DEPENDENCIES ---
jest.mock('../services/db', () => ({
    getMembers: jest.fn(),
    addMember: jest.fn(),
    deleteMember: jest.fn(),
    logEvent: jest.fn().mockResolvedValue()
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));

const db = require('../services/db');
const memberRoutes = require('../routes/api/members');

// --- 2. BUILD THE ISOLATED APP IN ONE LINE ---
const app = createTestApp(   [
        { path: '/api/members', router: memberRoutes }
    ]);


// --- 3. RUN TESTS ---
describe('Members API Endpoints (Isolated)', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/members', () => {
        it('should return 200 and an array of members', async () => {
            const mockData = [
                { id: 1, name: 'CFO John Doe', email: 'john@fenz.osm' },
                { id: 2, name: 'FF Jane Smith', email: 'jane@fenz.osm' }
            ];
            db.getMembers.mockResolvedValue(mockData);

            const response = await request(app).get('/api/members');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockData);
            expect(db.getMembers).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /api/members', () => {
        it('should add a member and return 200 with the new ID', async () => {
            db.addMember.mockResolvedValue(3);

            const newMemberPayload = {
                name: 'SO Bob Builder',
                email: 'bob@fenz.osm',
                mobile: '021123456',
                notificationPreference: 'email',
                enabled: true
            };

            const response = await request(app)
                .post('/api/members')
                .send(newMemberPayload);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', 3);
            expect(db.addMember).toHaveBeenCalledWith(newMemberPayload);
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