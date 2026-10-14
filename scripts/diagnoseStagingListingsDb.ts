import 'dotenv/config';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { basename } from 'node:path';
import * as schema from '../src/db/schema';
import { getSafeErrorLocations, getSafeErrorTypeChain, getSafeSqlState } from './diagnoseLocalListingsDb';

const STAGING_SUPABASE_PROJECT_REF = 'xuhzhdjmgvqzjxijmksu';
const CONFIRMATION_ENV = 'TVD_CONFIRM_STAGING_READONLY_DB_DIAGNOSTIC';
const REQUIRED_CONFIRMATION = 'CONFIRM_STAGING_READ_ONLY';
const CA_PATH_ENV = 'TVD_SUPABASE_DB_CA_PATH';

export function isApprovedStagingPoolerUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    const username = decodeURIComponent(url.username);
    const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
    const hasUnexpectedQueryParameter = [...url.searchParams.keys()].some((key) => key !== 'sslmode');

    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/i.test(url.hostname) &&
      username === 'postgres.' + STAGING_SUPABASE_PROJECT_REF &&
      url.password.length > 0 &&
      ['5432', '6543'].includes(url.port) &&
      url.pathname === '/postgres' &&
      !hasUnexpectedQueryParameter &&
      (!sslmode || ['require', 'verify-ca', 'verify-full'].includes(sslmode))
    );
  } catch {
    return false;
  }
}

/**
 * Use Supabase's session pooler for this multi-query diagnostic. Supabase's
 * transaction pooler (6543) has known Postgres.js pipelining limitations.
 * The host, database, user, and project remain allowlisted before this rewrite.
 */
export function getApprovedStagingConnectionUrl(value: string | undefined): string | null {
  if (typeof value !== 'string' || !isApprovedStagingPoolerUrl(value)) return null;

  try {
    const url = new URL(value);
    url.port = '5432';
    // TLS is configured with an explicit CA certificate below, never URL defaults.
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return null;
  }
}

export function hasExplicitRemoteDiagnosticConfirmation(value: string | undefined): boolean {
  return value === REQUIRED_CONFIRMATION;
}

function printRefusal(reason: string): void {
  console.log(JSON.stringify({ status: 'refused', reason }, null, 2));
  process.exitCode = 2;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const connectionUrl = getApprovedStagingConnectionUrl(databaseUrl);

  // This tool has an intentionally narrow remote allowlist: only the known staging
  // project's Supabase pooler. It does not accept arbitrary hosted DBs or localhost.
  if (!connectionUrl) {
    printRefusal('DATABASE_URL is not the allowlisted staging Supabase pooler URL; no database connection was attempted.');
    return;
  }

  // Require a one-command opt-in; do not put this confirmation in .env.
  if (!hasExplicitRemoteDiagnosticConfirmation(process.env[CONFIRMATION_ENV])) {
    printRefusal('Explicit remote read-only confirmation is missing; no database connection was attempted.');
    return;
  }

  // A trusted Supabase database root certificate is required; sslmode=require alone
  // encrypts transport but does not authenticate the server certificate.
  const caPath = process.env[CA_PATH_ENV];
  if (!caPath) {
    printRefusal('TVD_SUPABASE_DB_CA_PATH must point to the staging database root certificate; no database connection was attempted.');
    return;
  }

  let caCertificate: Buffer;
  try {
    caCertificate = readFileSync(caPath);
    if (caCertificate.length === 0) {
      printRefusal('The configured staging database root certificate is empty; no database connection was attempted.');
      return;
    }
  } catch {
    printRefusal('The configured staging database root certificate could not be read; no database connection was attempted.');
    return;
  }

  // Force certificate-verified TLS, use one connection, and disable prepared
  // statements. Use session-pooler port 5432 even if DATABASE_URL used 6543.
  const client = postgres(connectionUrl, {
    max: 1,
    connect_timeout: 8,
    idle_timeout: 5,
    max_lifetime: 30,
    prepare: false,
    ssl: { ca: caCertificate, rejectUnauthorized: true },
    connection: { application_name: 'tvd-staging-readonly-listings-diagnostic' },
  });

  const report: Record<string, unknown> = {
    target: 'allowlisted staging Supabase project',
    connectionMode: 'session-pooler',
    transactionMode: 'read-only',
    schemaCheck: 'not-run',
    migrationHistoryCheck: 'not-run',
    homeFeedQuery: 'not-run',
  };
  let failed = false;
  let migrationHistoryExists = false;

  try {
    try {
      const schemaRows = await client.begin('read only', async (tx) => {
        await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
        await tx.unsafe("SET LOCAL lock_timeout = '2000ms'");
        await tx.unsafe("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
        return tx.unsafe<{
          profile_website_url_exists: boolean;
          migration_history_exists: boolean;
        }[]>([
          'SELECT',
          '  EXISTS (',
          '    SELECT 1',
          '    FROM information_schema.columns',
          "    WHERE table_schema = 'public'",
          "      AND table_name = 'profiles'",
          "      AND column_name = 'website_url'",
          '  ) AS profile_website_url_exists,',
          "  to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migration_history_exists"
        ].join('\n'));
      });

      const schemaState = schemaRows[0];
      migrationHistoryExists = Boolean(schemaState?.migration_history_exists);
      report.schemaCheck = 'passed';
      report.profilesWebsiteUrlColumnExists = Boolean(schemaState?.profile_website_url_exists);
      report.migrationHistoryTableExists = migrationHistoryExists;

      if (!schemaState?.profile_website_url_exists) failed = true;
    } catch (error) {
      report.schemaCheck = 'failed';
      report.schemaSqlState = getSafeSqlState(error) || 'unclassified';
      failed = true;
    }

    if (migrationHistoryExists) {
      try {
        const migrationRows = await client.begin('read only', async (tx) => {
          await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
          await tx.unsafe("SET LOCAL lock_timeout = '2000ms'");
          await tx.unsafe("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
          return tx.unsafe<{
            migration_0004_or_later_recorded: boolean;
          }[]>([
            'SELECT EXISTS (',
            '  SELECT 1',
            '  FROM drizzle.__drizzle_migrations',
            '  WHERE created_at >= 1791449804969',
            ') AS migration_0004_or_later_recorded'
          ].join('\n'));
        });

        report.migrationHistoryCheck = 'passed';
        report.migration0004OrLaterRecorded = Boolean(migrationRows[0]?.migration_0004_or_later_recorded);
        if (!migrationRows[0]?.migration_0004_or_later_recorded) failed = true;
      } catch (error) {
        report.migrationHistoryCheck = 'failed';
        report.migrationHistorySqlState = getSafeSqlState(error) || 'unclassified';
        failed = true;
      }
    } else {
      report.migrationHistoryCheck = 'unavailable';
      report.migration0004OrLaterRecorded = null;
      failed = true;
    }

    try {
      const cards = await client.begin('read only', async (tx) => {
        await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
        await tx.unsafe("SET LOCAL lock_timeout = '2000ms'");
        await tx.unsafe("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
        const diagnosticDb = drizzle(tx as never, { schema });
        const { getHomeFeedListings } = await import('../src/app/services/listingService');
        return getHomeFeedListings(6, diagnosticDb as never);
      });

      report.homeFeedQuery = 'passed';
      report.returnedListingCount = cards.length;
    } catch (error) {
      report.homeFeedQuery = 'failed';
      report.homeFeedSqlState = getSafeSqlState(error) || 'unclassified';
      report.homeFeedErrorTypes = getSafeErrorTypeChain(error);
      report.homeFeedErrorLocations = getSafeErrorLocations(error);
      failed = true;
    }
  } finally {
    try {
      await client.end({ timeout: 5 });
    } catch {
      // Never print connection details or raw driver errors.
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (failed) process.exitCode = 1;
}

const invokedFile = basename(process.argv[1] || '');
if (invokedFile === 'diagnoseStagingListingsDb.ts' || invokedFile === 'diagnoseStagingListingsDb.js') {
  void main().catch(() => {
    console.log(JSON.stringify({
      status: 'failed',
      reason: 'The diagnostic failed before a safe report could be produced; raw error details were omitted.',
    }, null, 2));
    process.exitCode = 1;
  });
}
