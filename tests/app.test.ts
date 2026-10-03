import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Express Application Shell Routes', () => {
  const app = createApp();

  it('GET /health returns 200 OK status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
  });

  it('GET / returns 200 OK home page html with brand title', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('THE VINYL DROP');
    expect(response.text).toContain('/images/needle.svg');
  });

  it('GET /nonexistent-route returns 404', async () => {
    const response = await request(app).get('/nonexistent-route');
    expect(response.status).toBe(404);
    expect(response.text).toContain('404 — Page Not Found');
  });
});
