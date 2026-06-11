const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    getUsers:    jest.fn().mockResolvedValue([]),
    addUser:     jest.fn().mockResolvedValue(42),
    getUserById: jest.fn(),
    updateUser:  jest.fn().mockResolvedValue(),
    deleteUser:  jest.fn().mockResolvedValue(),
    adminResetPassword: jest.fn().mockResolvedValue(),
    getPreferences: jest.fn().mockResolvedValue({}),
    logEvent:    jest.fn().mockResolvedValue(),
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 }
}));

jest.mock('../services/mailer', () => ({
    sendNewAccountNotification:   jest.fn().mockResolvedValue(),
    sendAccountDeletionNotification: jest.fn().mockResolvedValue(),
    sendPasswordReset:            jest.fn().mockResolvedValue(),
}));

jest.mock('../middleware/rate-limiter', () => ({
    createUserLimiter: (req, res, next) => next(),
}));

const db = require('../services/db');
const userRoutes = require('../routes/api/users');

// Default session: admin (level 2)
const app = createTestApp([{ path: '/api/users', router: userRoutes }]);

// Superadmin session (level 3) for positive ceiling test
const superadminApp = createTestApp(
    [{ path: '/api/users', router: userRoutes }],
    { user: { id: 1, name: 'Super Admin', role: 'superadmin' } }
);

describe('Users API Endpoints (Isolated)', () => {
    beforeEach(() => jest.clearAllMocks());

    // -----------------------------------------------------------------------
    // POST /api/users — role-ceiling guard (F27)
    // -----------------------------------------------------------------------
    describe('POST /api/users — role-ceiling', () => {
        it('returns 403 when admin session tries to create a superadmin user', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ name: 'Escalated', email: 'esc@test.nz', role: 'superadmin' });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/at or above your own/i);
            expect(db.addUser).not.toHaveBeenCalled();
        });

        // H-03: admin cannot create another admin (>= guard); only strictly lower roles
        it('returns 403 when admin session tries to create an admin user (H-03 fix)', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ name: 'Peer Admin', email: 'peer@test.nz', role: 'admin' });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/at or above your own/i);
            expect(db.addUser).not.toHaveBeenCalled();
        });

        it.each(['simple', 'guest'])(
            'allows admin session to create a "%s" user (strictly lower role)',
            async (role) => {
                const res = await request(app)
                    .post('/api/users')
                    .send({ name: 'New User', email: `new-${role}@test.nz`, role });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(db.addUser).toHaveBeenCalled();
            }
        );

        // H-03: superadmin cannot create another superadmin
        it('returns 403 when superadmin session tries to create a superadmin user (H-03 fix)', async () => {
            const res = await request(superadminApp)
                .post('/api/users')
                .send({ name: 'New Super', email: 'super@test.nz', role: 'superadmin' });

            expect(res.status).toBe(403);
            expect(db.addUser).not.toHaveBeenCalled();
        });

        it('allows superadmin session to create an admin user (strictly lower)', async () => {
            const res = await request(superadminApp)
                .post('/api/users')
                .send({ name: 'New Admin', email: 'newadmin@test.nz', role: 'admin' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});
