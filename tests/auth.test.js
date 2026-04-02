// tests/auth.test.js
const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');

// Mock dependencies
jest.mock('../services/db', () => ({
    getUserByEmail: jest.fn(),
    authenticateUser: jest.fn(),
    logEvent: jest.fn().mockResolvedValue(),
    resetLoginAttempts: jest.fn().mockResolvedValue(),
    incrementLoginAttempts: jest.fn().mockResolvedValue()
}));
jest.mock('../config', () => ({
    auth: { username: 'super@admin.com', password: 'superpassword' },
    appMode: 'production'
}));
jest.mock('../services/whatsapp-service', () => ({ logout: jest.fn() }));

const db = require('../services/db');

// Build an app specifically for Auth testing (needs active session manipulation)
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.session = { destroy: jest.fn() }; // Mock the session object
    next();
});
app.use('/', authRoutes);

describe('Authentication Flow Regression', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should login successfully with valid database credentials', async () => {
        db.getUserByEmail.mockResolvedValue({ id: 1, email: 'user@fenz.osm', enabled: 1, blocked: 0 });
        db.authenticateUser.mockResolvedValue({ id: 1, name: 'User', role: 'admin' });
        
        // Mock getMfaData to bypass MFA for this test
        db.getMfaData = jest.fn().mockResolvedValue({ mfa_enabled: 0 }); 

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