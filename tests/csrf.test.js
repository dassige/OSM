const request = require('supertest');
const express = require('express');
const { csrfProtection, generateCsrfToken } = require('../middleware/csrf');

function makeApp(sessionData, apiKeyUser) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.session = sessionData || {};
        if (apiKeyUser) req.apiKeyUser = apiKeyUser;
        next();
    });
    app.use(csrfProtection);
    app.get('/test',    (req, res) => res.json({ ok: true }));
    app.post('/test',   (req, res) => res.json({ ok: true }));
    app.put('/test',    (req, res) => res.json({ ok: true }));
    app.delete('/test', (req, res) => res.json({ ok: true }));
    return app;
}

describe('CSRF Middleware', () => {

    describe('generateCsrfToken', () => {
        it('generates a 64-char hex token and stores it on the session', () => {
            const session = {};
            const token = generateCsrfToken({ session });
            expect(typeof token).toBe('string');
            expect(token).toHaveLength(64);
            expect(session.csrfToken).toBe(token);
        });

        it('returns the same token on subsequent calls (stable per session)', () => {
            const session = {};
            const t1 = generateCsrfToken({ session });
            const t2 = generateCsrfToken({ session });
            expect(t1).toBe(t2);
        });
    });

    describe('csrfProtection', () => {
        it('passes GET requests through without a token', async () => {
            const app = makeApp({ user: { id: 1 } });
            expect((await request(app).get('/test')).status).toBe(200);
        });

        it('blocks POST when session has a user but no CSRF token in header', async () => {
            const app = makeApp({ user: { id: 1 }, csrfToken: 'abc' });
            expect((await request(app).post('/test')).status).toBe(403);
        });

        it('blocks POST when header token does not match session token', async () => {
            const app = makeApp({ user: { id: 1 }, csrfToken: 'correct' });
            expect((await request(app).post('/test').set('x-csrf-token', 'wrong')).status).toBe(403);
        });

        it('allows POST when header token matches session token', async () => {
            const app = makeApp({ user: { id: 1 }, csrfToken: 'valid-token' });
            expect((await request(app).post('/test').set('x-csrf-token', 'valid-token')).status).toBe(200);
        });

        it('allows PUT when header token matches session token', async () => {
            const app = makeApp({ user: { id: 1 }, csrfToken: 'valid-token' });
            expect((await request(app).put('/test').set('x-csrf-token', 'valid-token')).status).toBe(200);
        });

        it('allows DELETE when header token matches session token', async () => {
            const app = makeApp({ user: { id: 1 }, csrfToken: 'valid-token' });
            expect((await request(app).delete('/test').set('x-csrf-token', 'valid-token')).status).toBe(200);
        });

        it('skips CSRF for API key authenticated requests (no session user needed)', async () => {
            const app = makeApp({}, { name: 'TestApiUser' });
            expect((await request(app).post('/test')).status).toBe(200);
        });

        it('skips CSRF when session has no user (unauthenticated / public endpoint)', async () => {
            const app = makeApp({}); // No user property
            expect((await request(app).post('/test')).status).toBe(200);
        });

        it('returns 403 JSON with an error message on failure', async () => {
            const app = makeApp({ user: { id: 1 }, csrfToken: 'abc' });
            const res = await request(app).post('/test');
            expect(res.status).toBe(403);
            expect(res.body).toHaveProperty('error');
        });
    });
});
