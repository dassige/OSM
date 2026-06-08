const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    verifyUserPassword: jest.fn(),
    getMfaData:         jest.fn(),
    setMfaSecret:       jest.fn().mockResolvedValue(),
    setMfaStatus:       jest.fn().mockResolvedValue(),
    logEvent:           jest.fn().mockResolvedValue(),
}));

jest.mock('../config', () => ({
    appMode: 'production',
    ui:      { loginTitle: 'TestApp' },
}));

jest.mock('speakeasy', () => ({
    generateSecret: jest.fn().mockReturnValue({
        base32:       'FAKESECRETBASE32',
        otpauth_url:  'otpauth://totp/TestApp:user@test.nz?secret=FAKESECRETBASE32',
    }),
    totp: {
        verify: jest.fn(),
    },
}));

jest.mock('qrcode', () => ({
    toDataURL: jest.fn((_url, cb) => cb(null, 'data:image/png;base64,fakeqr')),
}));

const db       = require('../services/db');
const speakeasy = require('speakeasy');
const profileRoutes = require('../routes/api/profile');

const app = createTestApp([{ path: '/api/profile', router: profileRoutes }]);

describe('Profile MFA Endpoints (Isolated)', () => {
    beforeEach(() => jest.clearAllMocks());

    // ─── F21: MFA setup requires current password ───────────────────────────────

    describe('POST /api/profile/mfa/setup', () => {
        it('returns 400 when currentPassword is absent', async () => {
            const res = await request(app).post('/api/profile/mfa/setup').send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/password is required/i);
            expect(db.verifyUserPassword).not.toHaveBeenCalled();
            expect(db.setMfaSecret).not.toHaveBeenCalled();
        });

        it('returns 403 when currentPassword is wrong', async () => {
            db.verifyUserPassword.mockResolvedValue(false);

            const res = await request(app)
                .post('/api/profile/mfa/setup')
                .send({ currentPassword: 'wrongpassword' });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/incorrect password/i);
            expect(db.setMfaSecret).not.toHaveBeenCalled();
        });

        it('returns 200 with QR code and secret when currentPassword is correct', async () => {
            db.verifyUserPassword.mockResolvedValue(true);

            const res = await request(app)
                .post('/api/profile/mfa/setup')
                .send({ currentPassword: 'correctpassword' });

            expect(res.status).toBe(200);
            expect(res.body.secret).toBe('FAKESECRETBASE32');
            expect(res.body.qrCode).toBe('data:image/png;base64,fakeqr');
            expect(db.setMfaSecret).toHaveBeenCalledWith(99, 'FAKESECRETBASE32');
        });
    });

    // ─── F4: MFA disable requires valid TOTP ────────────────────────────────────

    describe('POST /api/profile/mfa/disable', () => {
        it('returns 400 when totpToken is absent', async () => {
            const res = await request(app).post('/api/profile/mfa/disable').send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/code required/i);
            expect(db.setMfaStatus).not.toHaveBeenCalled();
        });

        it('returns 400 when MFA has no configured secret', async () => {
            db.getMfaData.mockResolvedValue({ mfa_secret: null, mfa_enabled: 0 });

            const res = await request(app)
                .post('/api/profile/mfa/disable')
                .send({ totpToken: '123456' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/not configured/i);
            expect(db.setMfaStatus).not.toHaveBeenCalled();
        });

        it('returns 403 when TOTP token is invalid', async () => {
            db.getMfaData.mockResolvedValue({ mfa_secret: 'FAKESECRETBASE32', mfa_enabled: 1 });
            speakeasy.totp.verify.mockReturnValue(false);

            const res = await request(app)
                .post('/api/profile/mfa/disable')
                .send({ totpToken: '000000' });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/invalid code/i);
            expect(db.setMfaStatus).not.toHaveBeenCalled();
        });

        it('returns 200 and clears MFA data when TOTP token is valid', async () => {
            db.getMfaData.mockResolvedValue({ mfa_secret: 'FAKESECRETBASE32', mfa_enabled: 1 });
            speakeasy.totp.verify.mockReturnValue(true);

            const res = await request(app)
                .post('/api/profile/mfa/disable')
                .send({ totpToken: '654321' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(db.setMfaStatus).toHaveBeenCalledWith(99, false);
            expect(db.setMfaSecret).toHaveBeenCalledWith(99, null);
            expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Security', 'MFA Disabled', expect.any(Object));
        });
    });
});
