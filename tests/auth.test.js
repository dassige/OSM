const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');

jest.mock('../services/db', () => ({
    getUserByEmail: jest.fn(),
    authenticateUser: jest.fn(),
    getMfaData: jest.fn(),
    logEvent: jest.fn().mockResolvedValue(),
    resetLoginAttempts: jest.fn().mockResolvedValue(),
    incrementLoginAttempts: jest.fn().mockResolvedValue()
}));
jest.mock('../config', () => ({
    auth: { username: 'super@admin.com', password: 'superpassword' },
    appMode: 'production',
    rateLimits: {
        login:         { windowMin: 15, max: 10  },
        mfa:           { windowMin: 5,  max: 5   },
        forgotPassword:{ windowMin: 30, max: 3   },
        api:           { windowMin: 1,  max: 300 },
    },
}));
jest.mock('../services/whatsapp-service', () => ({ logout: jest.fn() }));
jest.mock('speakeasy', () => ({
    totp: { verify: jest.fn() }
}));

const db = require('../services/db');

// Build an app specifically for Auth testing (needs active session manipulation)
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.session = { destroy: jest.fn() };
    next();
});
app.use('/', authRoutes);

describe('Authentication Flow Regression', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should login successfully with valid database credentials', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, email: 'user@fenz.osm', enabled: 1, blocked: 0 });
        db.authenticateUser.mockResolvedValue({ id: 1, name: 'User', role: 'admin' });
        
        db.getMfaData.mockResolvedValue({ mfa_enabled: 0 });

        const res = await request(app)
            .post('/login')
            .send({ username: 'user@fenz.osm', password: 'correctpassword' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.resetLoginAttempts).toHaveBeenCalled();
    });

    it('should return 401 Unauthorized for invalid credentials', async () => {
        db.getUserByEmail.mockResolvedValue(null);
        db.authenticateUser.mockResolvedValue(null);

        const res = await request(app)
            .post('/login')
            .send({ username: 'wrong@fenz.osm', password: 'badpassword' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid credentials');
    });

    it('should bypass DB and login as Super Admin if environment credentials match', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'super@admin.com', password: 'superpassword' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.authenticateUser).not.toHaveBeenCalled(); // Proves DB was bypassed
    });
});

const speakeasy = require('speakeasy');

// Separate app with mfaPendingUser already in the session (simulates post-login MFA step)
const mfaApp = express();
mfaApp.use(express.json());
mfaApp.use((req, res, next) => {
    req.session = {
        mfaPendingUser: { id: 1, name: 'Test User', email: 'user@fenz.osm', role: 'admin' }
    };
    next();
});
mfaApp.use('/', authRoutes);

describe('MFA Flow', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should respond with mfaRequired when the authenticated user has MFA enabled', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, enabled: 1, blocked: 0 });
        db.authenticateUser.mockResolvedValue({ id: 1, name: 'Test User', role: 'admin' });
        db.getMfaData.mockResolvedValue({ mfa_enabled: 1, mfa_secret: 'JBSWY3DPEHPK3PXP' });

        const res = await request(app)
            .post('/login')
            .send({ username: 'user@fenz.osm', password: 'correctpassword' });

        expect(res.status).toBe(200);
        expect(res.body.mfaRequired).toBe(true);
        expect(db.resetLoginAttempts).not.toHaveBeenCalled();
    });

    it('should return 401 when POST /login/mfa is called with no pending session', async () => {
        const res = await request(app)
            .post('/login/mfa')
            .send({ token: '123456' });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Session expired/);
    });

    it('should complete login when a valid MFA token is submitted', async () => {
        db.getMfaData.mockResolvedValue({ mfa_enabled: 1, mfa_secret: 'JBSWY3DPEHPK3PXP' });
        speakeasy.totp.verify.mockReturnValue(true);

        const res = await request(mfaApp)
            .post('/login/mfa')
            .send({ token: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.resetLoginAttempts).toHaveBeenCalledWith(1);
    });

    it('should return 401 when an invalid MFA token is submitted', async () => {
        db.getMfaData.mockResolvedValue({ mfa_enabled: 1, mfa_secret: 'JBSWY3DPEHPK3PXP' });
        speakeasy.totp.verify.mockReturnValue(false);

        const res = await request(mfaApp)
            .post('/login/mfa')
            .send({ token: '000000' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid Code');
    });
});