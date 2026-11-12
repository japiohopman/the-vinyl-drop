import request from 'supertest';
import { createApp } from '../src/app';

describe('Deferred public People search release boundary (Issue #404)', () => {
  const app = createApp();

  it.each([
    '/people',
    '/api/people-suggestions?q=crate',
    '/api/people-search?q=crate',
  ])('returns not found for the deferred public route %s', async (route) => {
    const response = await request(app).get(route);
    expect(response.status).toBe(404);
  });
});
