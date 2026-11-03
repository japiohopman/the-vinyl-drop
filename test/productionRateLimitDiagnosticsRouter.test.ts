import express from 'express';
import request from 'supertest';
import type { Router } from 'express';

const TOKEN = 'production-router-diagnostic-token-with-32-plus-characters';

jest.mock('../src/db', () => ({
  queryClient: {
    begin: jest.fn(async (callback: (sql: { unsafe: jest.Mock }) => Promise<unknown>) =>
      callback({ unsafe: jest.fn().mockResolvedValue([]) })
    ),
  },
  db: null,
  connectionString: '',
  getDb: jest.fn(() => {
    throw new Error('Database access is not part of this router test.');
  }),
  setOverrideDb: jest.fn(),
}));

let router: Router;
let routerDatabaseBegin: jest.Mock;
const environmentKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'APP_BASE_URL',
  'ALLOWED_REDIRECT_URLS',
  'RECOVERY_SIGNING_SECRET',
  'PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN',
  'SHARED_RATE_LIMITS_ENABLED',
  'MESSAGING_ENABLED',
  'SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED',
  'BETA_INVITE_ONLY_ENABLED',
] as const;
const previousEnvironment: Partial<Record<(typeof environmentKeys)[number], string | undefined>> = {};

beforeAll(() => {
  environmentKeys.forEach((key) => {
    previousEnvironment[key] = process.env[key];
  });

  Object.assign(process.env, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://diagnostic-test:diagnostic-test@127.0.0.1:5432/diagnostic_test',
    SUPABASE_URL: 'https://diagnostic-router-test.supabase.co',
    SUPABASE_ANON_KEY: 'diagnostic-router-test-anon-key',
    APP_BASE_URL: 'https://thevinyldrop.nl',
    ALLOWED_REDIRECT_URLS: 'https://thevinyldrop.nl',
    RECOVERY_SIGNING_SECRET: 'production-diagnostic-test-recovery-secret-key-32-bytes',
    PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN: TOKEN,
    SHARED_RATE_LIMITS_ENABLED: 'false',
    MESSAGING_ENABLED: 'false',
    SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: 'false',
    BETA_INVITE_ONLY_ENABLED: 'false',
  });

  jest.isolateModules(() => {
    router = jest.requireActual<{ default: Router }>('../src/app/routes').default;
    const { queryClient } = jest.requireMock('../src/db') as {
      queryClient: { begin: jest.Mock };
    };
    routerDatabaseBegin = queryClient.begin;
  });
});

afterAll(() => {
  environmentKeys.forEach((key) => {
    const previousValue = previousEnvironment[key];
    if (previousValue === undefined) delete process.env[key];
    else process.env[key] = previousValue;
  });
});

describe('production rate-limit diagnostics registered router', () => {
  it('returns pass/pass for an authorized production request through the real router', async () => {
    const app = express();
    app.use('/', router);

    const response = await request(app)
      .post('/_internal/production/rate-limit-diagnostics')
      .set('X-Production-Rate-Limit-Diagnostic-Token', TOKEN)
      .set('CF-Connecting-IP', '203.0.113.10');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ database: 'pass', clientIpHeader: 'pass' });
    expect(response.headers['cache-control']).toBe('no-store');

    expect(routerDatabaseBegin).toHaveBeenCalledTimes(1);
  });
});
