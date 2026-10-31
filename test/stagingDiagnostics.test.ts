import express from 'express';
import request from 'supertest';
import { createStagingDiagnosticsHandler, StagingDiagnosticsDependencies } from '../src/app/controllers/stagingDiagnosticsController';

const TOKEN = 'temporary-staging-diagnostic-token-32-bytes';

function buildApp(overrides: Partial<StagingDiagnosticsDependencies> = {}) {
  const dependencies: StagingDiagnosticsDependencies = {
    nodeEnv: 'staging',
    diagnosticToken: TOKEN,
    checkDatabase: jest.fn().mockResolvedValue(undefined),
    resolveClientIp: jest.fn().mockReturnValue('203.0.113.10'),
    ...overrides,
  };
  const app = express();
  app.post('/_internal/staging/diagnostics', createStagingDiagnosticsHandler(dependencies));
  return { app, dependencies };
}

describe('staging-only rate-limit runtime diagnostics', () => {
  it('returns only pass/fail results when the staging token, DB check, and Cloudflare IP are valid', async () => {
    const { app, dependencies } = buildApp();

    const response = await request(app)
      .post('/_internal/staging/diagnostics')
      .set('X-Staging-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ database: 'pass', clientIpHeader: 'pass' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(dependencies.checkDatabase).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response.body)).not.toContain('203.0.113.10');
  });

  it('hides the endpoint when the diagnostic token is missing or incorrect', async () => {
    const { app, dependencies } = buildApp();

    const missing = await request(app).post('/_internal/staging/diagnostics');
    const incorrect = await request(app)
      .post('/_internal/staging/diagnostics')
      .set('X-Staging-Diagnostic-Token', 'incorrect-token');

    expect(missing.status).toBe(404);
    expect(incorrect.status).toBe(404);
    expect(dependencies.checkDatabase).not.toHaveBeenCalled();
  });

  it('never exposes the diagnostic endpoint outside staging', async () => {
    const { app, dependencies } = buildApp({ nodeEnv: 'production' });

    const response = await request(app)
      .post('/_internal/staging/diagnostics')
      .set('X-Staging-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(404);
    expect(dependencies.checkDatabase).not.toHaveBeenCalled();
  });

  it('returns a neutral 503 without leaking database errors when the table is unavailable', async () => {
    const { app } = buildApp({
      checkDatabase: jest.fn().mockRejectedValue(new Error('database password must not leak')),
    });

    const response = await request(app)
      .post('/_internal/staging/diagnostics')
      .set('X-Staging-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ database: 'fail', clientIpHeader: 'pass' });
    expect(JSON.stringify(response.body)).not.toContain('database password');
  });

  it('fails when the Cloudflare client-IP header is unavailable', async () => {
    const { app } = buildApp({
      resolveClientIp: jest.fn().mockReturnValue(null),
    });

    const response = await request(app)
      .post('/_internal/staging/diagnostics')
      .set('X-Staging-Diagnostic-Token', TOKEN);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ database: 'pass', clientIpHeader: 'fail' });
  });
});
