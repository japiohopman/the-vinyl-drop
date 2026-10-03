import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('App Routes and Error Handling', () => {
  describe('GET /', () => {
    it('should render the home page with 200 OK and HTML content', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('THE VINYL DROP');
      expect(response.text).toContain('Welcome to The Vinyl Drop');
    });
  });

  describe('GET /health', () => {
    it('should return health status JSON with 200 OK', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 HTML response for non-existent route when HTML requested', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .set('Accept', 'text/html');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('404 - Page Not Found');
    });

    it('should return 404 JSON response for non-existent route when JSON requested', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toEqual({ error: 'Not Found' });
    });
  });
});
