const request = require('supertest');
const app = require('../server');

describe('System API Endpoints', () => {

    describe('GET /api/preferences', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).get('/api/preferences');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/logs', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app)
                .post('/api/logs')
                .send({ type: 'External Integration', title: 'Test Event' });
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('GET /ui-config', () => {
        it('returns 200 with appMode, scheduledBackupSupported, and deploymentType', async () => {
            const res = await request(app).get('/ui-config');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('appMode');
            expect(res.body).toHaveProperty('scheduledBackupSupported');
            expect(res.body).toHaveProperty('deploymentType');
        });
    });

    describe('GET /api/system/scheduled-backup', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).get('/api/system/scheduled-backup');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/system/scheduled-backup', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app)
                .post('/api/system/scheduled-backup')
                .send({ enabled: true });
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/system/scheduled-backup/run-now', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).post('/api/system/scheduled-backup/run-now');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('DELETE /api/system/scheduled-backup/history', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).delete('/api/system/scheduled-backup/history');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('GET /api/system/browse-directory', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).get('/api/system/browse-directory?path=/');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('GET /api/system/remote-backup', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).get('/api/system/remote-backup');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/system/remote-backup', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).post('/api/system/remote-backup').send({ name:'x', url:'http://x', apiKey:'k' });
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/system/remote-backup/test-inline', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).post('/api/system/remote-backup/test-inline').send({ url:'http://x', apiKey:'k' });
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    // F2: Reports endpoints now require admin role
    describe('GET /api/reports/data/:type', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).get('/api/reports/data/by-member');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/reports/pdf', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app)
                .post('/api/reports/pdf')
                .send({ html: '<h1>Test</h1>', title: 'Test' });
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });
    });
});
