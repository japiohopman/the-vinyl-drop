import { timingSafeEqual } from 'crypto';
import { Request, RequestHandler, Response } from 'express';
import { config } from '../../config/env';
import { queryClient } from '../../db';
import { getRateLimitClientIp } from '../services/rateLimitService';

export interface StagingDiagnosticsDependencies {
  nodeEnv: string;
  diagnosticToken: string;
  checkDatabase: () => Promise<void>;
  resolveClientIp: (req: Request, environment: 'staging') => string | null;
}

function matchesDiagnosticToken(expected: string, supplied: string | undefined): boolean {
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');

  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

/**
 * Temporary, staging-only runtime probe for Issue #89.
 *
 * It returns only pass/fail results. It never returns or logs the client IP,
 * database identity, credentials, query errors, or counter data.
 */
export function createStagingDiagnosticsHandler(
  dependencies: StagingDiagnosticsDependencies,
): RequestHandler {
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    void (async () => {
      const suppliedToken = req.headers['x-staging-diagnostic-token'];
      if (
        dependencies.nodeEnv !== 'staging'
        || !dependencies.diagnosticToken
        || typeof suppliedToken !== 'string'
        || !matchesDiagnosticToken(dependencies.diagnosticToken, suppliedToken)
      ) {
        res.status(404).end();
        return;
      }

      const clientIpPresent = dependencies.resolveClientIp(req, 'staging') !== null;
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

  // No rows are read or changed. This proves the Render app's configured
  // PostgreSQL connection can reach the migrated private table.
  await queryClient.unsafe('SELECT 1 FROM private.rate_limit_buckets LIMIT 0');
}

export const postStagingDiagnostics = createStagingDiagnosticsHandler({
  nodeEnv: config.NODE_ENV,
  diagnosticToken: config.STAGING_DIAGNOSTIC_TOKEN,
  checkDatabase: checkRateLimitTableAccess,
  resolveClientIp: getRateLimitClientIp,
});
