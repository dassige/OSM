const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');

jest.mock('../services/db', () => ({
    getUserByEmail: jest.fn(),
    authenticateUser: jest.fn(),
    getMfaData: jest.fn(),
    logEvent: jest.fn().mockResolvedValue(),
    resetLoginAttempts: jest.fn().mockResolvedValue(),
    incrementLoginAttempts: jest.fn().mockResolvedValue(),
    getPreferences: jest.fn().mockResolvedValue({}),
    storePasswordResetToken: jest.fn().mockResolvedValue(),
    getUserByResetToken: jest.fn(),
    clearPasswordResetToken: jest.fn().mockResolvedValue(),
    adminResetPassword: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/mailer', () => ({
    sendPasswordResetLink: jest.fn().mockResolvedValue(),
}));
jest.mock('../config', () => ({
    auth: { username: 'super@admin.com', password: 'superpassword' },
    appMode: 'production',
    ui: { loginTitle: 'TestApp' },
    transporter: {},
    rateLimits: {
        login:         { windowMin: 15, max: 10  },
        mfa:           { windowMin: 5,  max: 5   },
        forgotPassword:{ windowMin: 30, max: 3   },
        api:           { windowMin: 1,  max: 300 },
        publicSubmit:  { windowMin: 5,  max: 30  },
    },
}));
jest.mock('../services/whatsapp-service', () => ({ logout: jest.fn() }));
jest.mock('../services/geo-ip', () => ({ lookupIp: jest.fn().mockReturnValue(null) }));
jest.mock('../middleware/rate-limiter', () => ({
    loginLimiter:           (req, res, next) => next(),
    mfaLimiter:             (req, res, next) => next(),
    forgotPasswordLimiter:  (req, res, next) => next(),
}));
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

const mailer = require('../services/mailer');

// ─── F23: Login must check enabled/blocked AFTER password verification ────────

describe('Login — account state check ordering (F23)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 401 (not 403) for a DISABLED account with a wrong password', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, enabled: 0, blocked: 0 });
        db.authenticateUser.mockResolvedValue(null); // wrong password

        const res = await request(app)
            .post('/login')
            .send({ username: 'disabled@fenz.osm', password: 'wrong' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 401 (not 403) for a BLOCKED account with a wrong password', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, enabled: 1, blocked: 1 });
        db.authenticateUser.mockResolvedValue(null); // wrong password

        const res = await request(app)
            .post('/login')
            .send({ username: 'blocked@fenz.osm', password: 'wrong' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 403 for a DISABLED account with the correct password', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, enabled: 0, blocked: 0 });
        db.authenticateUser.mockResolvedValue({ id: 1, name: 'User', role: 'simple' });

        const res = await request(app)
            .post('/login')
            .send({ username: 'disabled@fenz.osm', password: 'correctpassword' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/disabled/i);
    });

    it('returns 403 for a BLOCKED account with the correct password', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, enabled: 1, blocked: 1 });
        db.authenticateUser.mockResolvedValue({ id: 1, name: 'User', role: 'simple' });

        const res = await request(app)
            .post('/login')
            .send({ username: 'blocked@fenz.osm', password: 'correctpassword' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/blocked/i);
    });
});

// ─── F8/F22: Forgot-password always returns 200 uniform message ───────────────

describe('POST /forgot-password — uniform response (F8/F22)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 with message for an UNKNOWN email (no 404)', async () => {
        db.getUserByEmail.mockResolvedValue(null);

        const res = await request(app)
            .post('/forgot-password')
            .send({ email: 'unknown@fenz.osm' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
        expect(db.storePasswordResetToken).not.toHaveBeenCalled();
        expect(mailer.sendPasswordResetLink).not.toHaveBeenCalled();
    });

    it('returns 200 with the SAME message for a KNOWN email', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, email: 'user@fenz.osm' });

        const res = await request(app)
            .post('/forgot-password')
            .send({ email: 'user@fenz.osm' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
        expect(db.storePasswordResetToken).toHaveBeenCalled();
        expect(mailer.sendPasswordResetLink).toHaveBeenCalled();
    });

    it('both responses have identical message text', async () => {
        db.getUserByEmail.mockResolvedValueOnce(null);
        const res1 = await request(app)
            .post('/forgot-password')
            .send({ email: 'unknown@fenz.osm' });

        db.getUserByEmail.mockResolvedValueOnce({ id: 1, email: 'user@fenz.osm' });
        const res2 = await request(app)
            .post('/forgot-password')
            .send({ email: 'user@fenz.osm' });

        expect(res1.body.message).toBe(res2.body.message);
    });
});

// ─── F19/F20: Token-based password reset ────────────────────────────────────

describe('POST /reset-password — token-based reset (F19/F20)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 400 when token or newPassword is missing', async () => {
        const res = await request(app)
            .post('/reset-password')
            .send({ token: 'abc' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/i);
    });

    it('returns 400 when newPassword fails complexity (too short)', async () => {
        const res = await request(app)
            .post('/reset-password')
            .send({ token: 'sometoken', newPassword: 'Short1' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/8 characters/i);
    });

    it('returns 400 when newPassword has no uppercase letter', async () => {
        const res = await request(app)
            .post('/reset-password')
            .send({ token: 'sometoken', newPassword: 'nouppercase1' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/uppercase/i);
    });

    it('returns 400 when newPassword has no digit', async () => {
        const res = await request(app)
            .post('/reset-password')
            .send({ token: 'sometoken', newPassword: 'NoDigitPass' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/digit/i);
    });

    it('returns 400 when the token does not exist in the DB', async () => {
        db.getUserByResetToken.mockResolvedValue(null);

        const res = await request(app)
            .post('/reset-password')
            .send({ token: 'invalidtoken', newPassword: 'ValidPass1!' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid or has expired/i);
        expect(db.adminResetPassword).not.toHaveBeenCalled();
    });

    it('returns 400 when the token is found but has expired', async () => {
        db.getUserByResetToken.mockResolvedValue({
            id: 1,
            email: 'user@fenz.osm',
            reset_token_expires: Date.now() - 1000, // expired 1 second ago
        });

        const res = await request(app)
            .post('/reset-password')
            .send({ token: 'expiredtoken', newPassword: 'ValidPass1!' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid or has expired/i);
        expect(db.adminResetPassword).not.toHaveBeenCalled();
    });

    it('returns 200 and resets the password for a valid unexpired token', async () => {
        db.getUserByResetToken.mockResolvedValue({
            id: 1,
            email: 'user@fenz.osm',
            name: 'Test User',
            reset_token_expires: Date.now() + 30 * 60 * 1000,
        });

        const res = await request(app)
            .post('/reset-password')
            .send({ token: 'validtoken', newPassword: 'NewSecurePass1!' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.adminResetPassword).toHaveBeenCalledWith(1, 'NewSecurePass1!');
        expect(db.clearPasswordResetToken).toHaveBeenCalledWith(1);
        expect(db.logEvent).toHaveBeenCalledWith('System', 'Security', 'Password Reset Completed', expect.any(Object));
    });
});