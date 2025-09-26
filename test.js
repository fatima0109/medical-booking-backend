import request from 'supertest';
import app from './server.js';

describe('GET /api/health', () => {
  it('should return 200 OK and server status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
  });
});