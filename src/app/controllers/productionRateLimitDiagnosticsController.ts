import { timingSafeEqual } from 'crypto';
import { Request, RequestHandler } from 'express';
import { config } from '../../config/env';
import { queryClient } from '../../db';
import { getRateLimitClientIp } from '../services/rateLimitService';

export interface ProductionRateLimitDiagnosticsDependencies {
  nodeEnv: string;
  diagnosticToken: string;
  checkDatabase: () => Promise<void>;
  resolveClientIp: (req: Request, environment: 'production') => string | null;
}

function matchesDiagnosticToken(expected: string, supplied: string | undefined): boolean {
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');

  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

/**
 * Temporary, production-only runtime probe for Issue #89.
 *
 * It returns only pass/fail results. It never returns or logs the client IP,
 * database identity, credentials, query errors, or counter data.
 */
export function createProductionRateLimitDiagnosticsHandler(
  dependencies: ProductionRateLimitDiagnosticsDependencies,
): RequestHandler {
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    void (async () => {
      const suppliedToken = req.headers['x-production-rate-limit-diagnostic-token'];
      if (
        dependencies.nodeEnv !== 'production'
        || !dependencies.diagnosticToken
        || typeof suppliedToken !== 'string'
        || !matchesDiagnosticToken(dependencies.diagnosticToken, suppliedToken)
      ) {
        res.status(404).end();
        return;
      }

      const clientIpPresent = dependencies.resolveClientIp(req, 'production') !== null;
      let databaseAccess = false;

      try {
        await dependencies.checkDatabase();
        databaseAccess = true;
      } catch {
        // Keep database errors and credentials out of the diagnostic response.
      }

      const passed = clientIpPresent && databaseAccess;
      res.status(passed ? 200 : 503).json({
        database: databaseAccess ? 'pass' : 'fail',
        clientIpHeader: clientIpPresent ? 'pass' : 'fail',
      });
    })().catch(() => {
      // Fail closed without exposing unexpected diagnostics or request data.
      if (!res.headersSent) {
        res.status(503).json({ database: 'fail', clientIpHeader: 'fail' });
      }
    });
  };
}

async function checkRateLimitTableAccess(): Promise<void> {
  if (!queryClient) throw new Error('Database connection is unavailable.');

  // No rows are read or changed. This is a zero-row query through the Render
  // app's configured DATABASE_URL connection and proves app-role table access.
  await queryClient.unsafe('SELECT 1 FROM private.rate_limit_buckets LIMIT 0');
}

export const postProductionRateLimitDiagnostics = createProductionRateLimitDiagnosticsHandler({
  nodeEnv: config.NODE_ENV,
  diagnosticToken: config.PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN,
  checkDatabase: checkRateLimitTableAccess,
  resolveClientIp: getRateLimitClientIp,
});
