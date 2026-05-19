const request = require('supertest');
const express = require('express');
const correlationId = require('../middleware/correlation-id');

function createApp() {
    const app = express();
    app.use(correlationId);
    app.get('/test', (req, res) => res.json({ id: req.id }));
    return app;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('correlationId middleware', () => {
    it('generates a UUID and sets X-Request-Id when no header is provided', async () => {
        const res = await request(createApp()).get('/test');
        expect(res.status).toBe(200);
        expect(res.headers['x-request-id']).toMatch(UUID_RE);
        expect(res.body.id).toBe(res.headers['x-request-id']);
    });

    it('echoes an existing X-Request-Id header back in the response', async () => {
        const existingId = 'my-trace-id-abc-123';
        const res = await request(createApp()).get('/test').set('X-Request-Id', existingId);
        expect(res.status).toBe(200);
        expect(res.headers['x-request-id']).toBe(existingId);
        expect(res.body.id).toBe(existingId);
    });

    it('generates a unique ID for each request', async () => {
        const app = createApp();
        const [res1, res2] = await Promise.all([
            request(app).get('/test'),
            request(app).get('/test'),
        ]);
        expect(res1.headers['x-request-id']).not.toBe(res2.headers['x-request-id']);
    });
});
