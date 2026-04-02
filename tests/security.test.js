// tests/security.test.js
const request = require('supertest');
const { createTestApp } = require('./test-utils');
const memberRoutes = require('../routes/api/members');
const systemRoutes = require('../routes/api/system');

// Mock dependencies
jest.mock('../services/db', () => ({
    getMembers: jest.fn().mockResolvedValue([]),
    addMember: jest.fn(),
    purgeEventLog: jest.fn()
}));

// We MUST use the REAL auth middleware here to test if it blocks requests properly!
jest.unmock('../middleware/auth'); 

// --- App 1: Simple User ---
const simpleUserApp = createTestApp(
    [
        { path: '/api/members', router: memberRoutes },
        { path: '/api/system', router: systemRoutes }
    ],
    { user: { id: 1, name: 'Simple FF', role: 'simple' } } // Inject SIMPLE role
);

// --- App 2: Admin User ---
const adminUserApp = createTestApp(
    [
        { path: '/api/members', router: memberRoutes },
        { path: '/api/system', router: systemRoutes }
    ],
    { user: { id: 2, name: 'Admin Officer', role: 'admin' } } // Inject ADMIN role
);

describe('Role-Based Access Control (RBAC) Regression', () => {
    
    describe('Simple User Permissions', () => {
        it('blocks simple user from GETting members (requires admin role)', async () => {
            const res = await request(simpleUserApp).get('/api/members');
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/Forbidden/);
        });

        it('blocks simple user from POSTing a member (requires admin role)', async () => {
            const res = await request(simpleUserApp)
                .post('/api/members')
                .send({ name: 'Hacker', email: 'hack@fenz.osm' });
                
            expect(res.status).toBe(403);
        });
    });

    describe('Admin User Permissions', () => {
        it('allows admin user to GET members', async () => {
            const res = await request(adminUserApp).get('/api/members');
            expect(res.status).toBe(200); // Admin should succeed!
        });

        it('blocks admin user from purging the event log (requires superadmin role)', async () => {
            // Even though they are an admin, they aren't a superadmin!
            const res = await request(adminUserApp).delete('/api/system/events/all');
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/Forbidden/);
        });
    });
});