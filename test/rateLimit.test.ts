import express from 'express';
import request from 'supertest';
import {
  createInMemoryRateLimitStoreForTests,
  createRateLimitMiddleware,
  getRateLimitClientIp,
  RateLimitRule,
  setRateLimitStoreForTests,
} from '../src/app/services/rateLimitService';

describe('shared rate-limit middleware', () => {
  beforeEach(() => {
    setRateLimitStoreForTests(createInMemoryRateLimitStoreForTests());
  });

  afterEach(() => {
    setRateLimitStoreForTests(null);
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function buildApp(rules: RateLimitRule[], handler?: express.RequestHandler): express.Express {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.post('/limited', createRateLimitMiddleware(rules), handler || ((_req, res) => res.status(200).send('ok')));
    return app;
  }

  it('uses only one valid CF-Connecting-IP value in hosted environments', () => {
    const req = {
      headers: { 'cf-connecting-ip': '203.0.113.10', 'x-forwarded-for': '198.51.100.99' },
      socket: { remoteAddress: '10.0.0.2' },
    } as unknown as express.Request;

    expect(getRateLimitClientIp(req, 'production')).toBe('203.0.113.10');

    req.headers['cf-connecting-ip'] = '203.0.113.10, 198.51.100.7';
    expect(getRateLimitClientIp(req, 'production')).toBeNull();

    delete req.headers['cf-connecting-ip'];
    expect(getRateLimitClientIp(req, 'production')).toBeNull();
    expect(getRateLimitClientIp(req, 'test')).toBe('10.0.0.2');
  });

  it('rejects requests after the configured fixed-window count', async () => {
    const app = buildApp([{
      name: 'test-ip',
      windowMs: 60_000,
      maxHits: 2,
      identify: (req) => String(req.headers['cf-connecting-ip'] || ''),
      required: true,
    }]);

    const first = await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.10');
    const second = await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.10');
    const third = await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.10');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
    expect(third.text).toContain('Too many requests');
  });

  it('uses a new fixed window after the previous window expires', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-31T07:00:00.000Z'));
    const app = buildApp([{
      name: 'window-test',
      windowMs: 60_000,
      maxHits: 1,
      identify: (req) => String(req.headers['cf-connecting-ip'] || ''),
      required: true,
    }]);

    expect((await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.11')).status).toBe(200);
    expect((await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.11')).status).toBe(429);

    now.mockReturnValue(Date.parse('2026-10-31T07:01:01.000Z'));
    expect((await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.11')).status).toBe(200);
  });

  it('releases the per-identity login reservation after a successful response', async () => {
    const rules: RateLimitRule[] = [
      {
        name: 'login-ip',
        windowMs: 60_000,
        maxHits: 10,
        identify: (req) => String(req.headers['cf-connecting-ip'] || ''),
        required: true,
      },
      {
        name: 'login-failed-email',
        windowMs: 60_000,
        maxHits: 1,
        identify: (req) => String(req.body.email || ''),
        releaseOnSuccess: true,
      },
    ];
    const app = buildApp(rules, (req, res) => {
      res.status(req.body.result === 'success' ? 302 : 400).end();
    });

    expect((await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.12').type('form').send('email=a@example.com&result=failed')).status).toBe(400);
    expect((await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.12').type('form').send('email=a@example.com&result=success')).status).toBe(302);
    expect((await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.12').send('email=a@example.com&result=failed')).status).toBe(400);
  });

  it('fails closed with a neutral 503 response when the counter store is unavailable', async () => {
    setRateLimitStoreForTests({
      increment: async () => { throw new Error('database password must not leak'); },
      decrement: async () => undefined,
      prune: async () => undefined,
    });
    const app = buildApp([{
      name: 'store-failure',
      windowMs: 60_000,
      maxHits: 1,
      identify: (req) => String(req.headers['cf-connecting-ip'] || ''),
      required: true,
    }]);

    const response = await request(app).post('/limited').set('CF-Connecting-IP', '203.0.113.13');
    expect(response.status).toBe(503);
    expect(response.text).toContain('temporarily unavailable');
    expect(response.text).not.toContain('database password');
  });
});
