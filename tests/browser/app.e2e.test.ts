import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Browser Application Shell End-to-End Test', () => {
  const app = createApp();

  it('renders home page with brand header and needle logo', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('THE VINYL DROP');
    expect(response.text).toContain('/images/needle.svg');
    expect(response.text).toContain('Buy. Trade. Dig.');
  });
});
