// Verifies globalAuthGuard exposes exactly the public Booking Events surface:
// the /booking/<slug> page and the /api/live-bookings/* API are reachable without
// a session, while the admin pages and /api/bookings/* stay protected.
const express = require('express');
const request = require('supertest');

jest.mock('../services/db/api-keys', () => ({
    getApiKeyByHash: jest.fn().mockResolvedValue(null),
    touchApiKey: jest.fn().mockResolvedValue(),
    hashKey: jest.fn((k) => `hash:${k}`),
    logApiCall: jest.fn(),
}));
jest.mock('../services/geo-ip', () => ({ lookupIp: jest.fn() }));

const { globalAuthGuard } = require('../middleware/auth');

function buildApp(session = {}) {
    const app = express();
    app.use((req, res, next) => { req.session = session; next(); });
    app.use(globalAuthGuard);
    app.use((req, res) => res.status(200).json({ reached: req.path }));
    return app;
}

describe('globalAuthGuard — Booking Events public surface', () => {
    const anon = buildApp();

    it.each([
        '/booking/3115fc90-5c05-4ba5-bdcf-6b5a341b87bc',
        '/bookings-view.html',
        '/api/live-bookings/3115fc90-5c05-4ba5-bdcf-6b5a341b87bc',
        '/api/live-bookings/3115fc90-5c05-4ba5-bdcf-6b5a341b87bc/book',
    ])('lets anonymous visitors reach %s', async (path) => {
        const res = await request(anon).get(path);
        expect(res.status).toBe(200);
        expect(res.body.reached).toBe(path);
    });

    it.each(['/bookings-manage.html', '/live-bookings.html', '/bookings-dashboard.html'])(
        'redirects anonymous visitors away from admin page %s', async (path) => {
            const res = await request(anon).get(path);
            expect(res.status).toBe(302);
            expect(res.headers.location).toBe('/login.html');
        });

    it.each(['/api/bookings/templates', '/api/bookings/events/1'])(
        'rejects anonymous calls to the admin API %s', async (path) => {
            const res = await request(anon).get(path);
            expect(res.status).toBe(401);
        });

    it('does not treat look-alike paths as public', async () => {
        const res = await request(anon).get('/bookings/whatever');
        expect(res.status).toBe(302);
    });

    it('lets a logged-in session through to the admin API', async () => {
        const res = await request(buildApp({ loggedIn: true, user: { role: 'admin' } })).get('/api/bookings/events');
        expect(res.status).toBe(200);
    });
});
