import express from 'express';
import request from 'supertest';
import router from '../src/app/routes';
import {
  createProductionRateLimitDiagnosticsHandler,
  ProductionRateLimitDiagnosticsDependencies,
} from '../src/app/controllers/productionRateLimitDiagnosticsController';

const TOKEN = 'temporary-production-rate-limit-diagnostic-token-64-characters-long';

function buildApp(overrides: Partial<ProductionRateLimitDiagnosticsDependencies> = {}) {
  const dependencies: ProductionRateLimitDiagnosticsDependencies = {
    nodeEnv: 'production',
    diagnosticToken: TOKEN,
    checkDatabase: jest.fn().mockResolvedValue(undefined),
    resolveClientIp: jest.fn().mockReturnValue('203.0.113.10'),
    ...overrides,
  };
  const app = express();
  app.post('/_internal/production/rate-limit-diagnostics', createProductionRateLimitDiagnosticsHandler(dependencies));
  return { app, dependencies };
}

describe('production rate-limit runtime diagnostics', () => {
  it('returns only pass/fail results when token, app DB access, and Cloudflare IP are valid', async () => {
    const { app, dependencies } = buildApp();

    const response = await request(app)
      .post('/_internal/production/rate-limit-diagnostics')
      .set('X-Production-Rate-Limit-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ database: 'pass', clientIpHeader: 'pass' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(dependencies.checkDatabase).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response.body)).not.toContain('203.0.113.10');
  });

  it('hides the endpoint when the diagnostic token is missing or incorrect', async () => {
    const { app, dependencies } = buildApp();

    const missing = await request(app).post('/_internal/production/rate-limit-diagnostics');
    const incorrect = await request(app)
      .post('/_internal/production/rate-limit-diagnostics')
      .set('X-Production-Rate-Limit-Diagnostic-Token', 'incorrect-token');

    expect(missing.status).toBe(404);
    expect(incorrect.status).toBe(404);
    expect(dependencies.checkDatabase).not.toHaveBeenCalled();
  });

  it('never exposes the diagnostic endpoint outside production', async () => {
    const { app, dependencies } = buildApp({ nodeEnv: 'staging' });

    const response = await request(app)
      .post('/_internal/production/rate-limit-diagnostics')
      .set('X-Production-Rate-Limit-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(404);
    expect(dependencies.checkDatabase).not.toHaveBeenCalled();
  });

  it('returns a neutral 503 without leaking database errors when the table is unavailable', async () => {
    const { app } = buildApp({
      checkDatabase: jest.fn().mockRejectedValue(new Error('database password must not leak')),
    });

    const response = await request(app)
      .post('/_internal/production/rate-limit-diagnostics')
      .set('X-Production-Rate-Limit-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ database: 'fail', clientIpHeader: 'pass' });
    expect(JSON.stringify(response.body)).not.toContain('database password');
  });

  it('fails when the Cloudflare client-IP header is unavailable', async () => {
    const { app } = buildApp({
      resolveClientIp: jest.fn().mockReturnValue(null),
    });

    const response = await request(app)
      .post('/_internal/production/rate-limit-diagnostics')
      .set('X-Production-Rate-Limit-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ database: 'pass', clientIpHeader: 'fail' });
  });
});

const FALLBACK_HTML_BODY = '<!DOCTYPE html><html><body><h1>Fallback 404 Not Found</h1></body></html>';

function buildRouterIntegrationApp() {
  const app = express();
  app.use('/', router);
  app.use((_req, res) => {
    res.status(404).type('html').send(FALLBACK_HTML_BODY);
  });
  return app;
}

describe('production rate-limit diagnostics router integration', () => {
  it('returns empty 404 from the registered controller on the exact diagnostic path without running the fallback HTML handler', async () => {
    const app = buildRouterIntegrationApp();

    const response = await request(app).post('/_internal/production/rate-limit-diagnostics');

    expect(response.status).toBe(404);
    expect(response.text).toBe('');
    expect(response.text).not.toContain(FALLBACK_HTML_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['pragma']).toBe('no-cache');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('routes a deliberately incorrect near-miss path to the fallback HTML handler', async () => {
    const app = buildRouterIntegrationApp();

    const response = await request(app).post('/_internal/production/rate-limit-diagnostic');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain(FALLBACK_HTML_BODY);
  });
});
