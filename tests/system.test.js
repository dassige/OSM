const request = require('supertest');
const app = require('../server');

describe('System API Endpoints', () => {
  
  describe('GET /api/preferences', () => {
    
    it('should return 401 Unauthorized if no active session exists', async () => {
      const response = await request(app).get('/api/preferences');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

  });

  describe('GET /ui-config', () => {
    
    it('should return 200 OK because ui-config is an unprotected public route', async () => {
      const response = await request(app).get('/ui-config');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('appMode');
    });
    
  });
});