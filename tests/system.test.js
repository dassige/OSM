// tests/system.test.js
const request = require('supertest');
const app = require('../server'); // Imports our Express app

describe('System API Endpoints', () => {
  
  describe('GET /api/preferences', () => {
    
    it('should return 401 Unauthorized if no active session exists', async () => {
      // We attempt to fetch preferences without logging in
      const response = await request(app).get('/api/preferences');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    // NOTE: To test a 200 OK response, we will need to mock the session middleware 
    // or simulate a login POST request first. We will tackle that next!
  });

  describe('GET /ui-config', () => {
    
    it('should return 200 OK because ui-config is an unprotected public route', async () => {
      const response = await request(app).get('/ui-config');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('appMode');
    });
    
  });
});