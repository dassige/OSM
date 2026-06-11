const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    listRemoteBackupServers:     jest.fn().mockResolvedValue([]),
    countRemoteBackupServers:    jest.fn().mockResolvedValue(0),
    createRemoteBackupServer:    jest.fn().mockResolvedValue(1),
    getRemoteBackupServer:       jest.fn().mockResolvedValue({ id: 1, name: 'HQ', url: 'http://opready.example.com', api_key: 'hashed', backup_type: 'db' }),
    updateRemoteBackupServer:    jest.fn().mockResolvedValue(),
    deleteRemoteBackupServer:    jest.fn().mockResolvedValue(),
    getRemoteBackupHistory:      jest.fn().mockResolvedValue([]),
    clearRemoteBackupHistory:    jest.fn().mockResolvedValue(),
    updateRemoteBackupSchedule:  jest.fn().mockResolvedValue(),
    logEvent:                    jest.fn().mockResolvedValue(),
}));

jest.mock('../services/remote-backup-service', () => ({
    stopServerSchedule:    jest.fn(),
    restartServerSchedule: jest.fn().mockResolvedValue(),
    pullBackup:            jest.fn().mockResolvedValue({ filename: 'backup.sql', fileSize: 1024 }),
    testConnection:        jest.fn().mockResolvedValue({ ok: true }),
    getBackupStream:       jest.fn(),
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 },
}));

jest.mock('../services/logger', () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
}));

jest.mock('../config', () => ({
    appMode:                  'production',
    backupRootDir:            '/app/backups',
    scheduledBackupSupported: true,
    rateLimits: {
        login:         { windowMin: 15, max: 10  },
        mfa:           { windowMin: 5,  max: 5   },
        forgotPassword:{ windowMin: 30, max: 3   },
        api:           { windowMin: 1,  max: 300 },
        publicSubmit:  { windowMin: 5,  max: 30  },
    },
}));

const remoteBackupRoutes = require('../routes/api/remote-backup');
const app = createTestApp({ path: '/api/remote-backup', router: remoteBackupRoutes });

beforeEach(() => jest.clearAllMocks());

// ── POST / — path traversal guard (M-07) ─────────────────────────────────────

describe('POST /api/remote-backup — backup location path traversal guard (M-07)', () => {
    const base = {
        name:   'HQ Remote',
        url:    'http://opready.example.com',
        apiKey: 'osm_testkey1234',
    };

    it('accepts an empty backup location (service uses its own default)', async () => {
        const db = require('../services/db');
        db.createRemoteBackupServer.mockResolvedValue(42);
        const res = await request(app)
            .post('/api/remote-backup')
            .send({ ...base, backupLocation: '' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id', 42);
    });

    it('accepts a backup location inside the configured root', async () => {
        const db = require('../services/db');
        db.createRemoteBackupServer.mockResolvedValue(43);
        const res = await request(app)
            .post('/api/remote-backup')
            .send({ ...base, backupLocation: '/app/backups/hq' });
        expect(res.status).toBe(200);
    });

    it('rejects a backup location outside the configured root', async () => {
        const res = await request(app)
            .post('/api/remote-backup')
            .send({ ...base, backupLocation: '/etc/passwd' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/backup root/i);
    });

    it('rejects a path traversal attempt (../../ escape)', async () => {
        const res = await request(app)
            .post('/api/remote-backup')
            .send({ ...base, backupLocation: '/app/backups/../../etc/crontab' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/backup root/i);
    });
});

// ── PUT /:id — path traversal guard (M-07) ───────────────────────────────────

describe('PUT /api/remote-backup/:id — backup location path traversal guard (M-07)', () => {
    it('rejects a backup location outside the configured root on update', async () => {
        const res = await request(app)
            .put('/api/remote-backup/1')
            .send({
                name:           'HQ Remote',
                url:            'http://opready.example.com',
                backupLocation: '/var/www/html',
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/backup root/i);
    });

    it('accepts a valid sub-path on update', async () => {
        const res = await request(app)
            .put('/api/remote-backup/1')
            .send({
                name:           'HQ Remote',
                url:            'http://opready.example.com',
                backupLocation: '/app/backups/remote/hq',
            });
        expect(res.status).toBe(200);
    });
});
