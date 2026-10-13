import 'dotenv/config';
import postgres from 'postgres';
import { basename } from 'node:path';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MIGRATION_0004_TIMESTAMP = 1791449804969;

export function isLoopbackPostgresUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') &&
      LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/**
 * Exposes only a validated SQLSTATE from a real postgres.js PostgresError.
 * Never return the driver's message, detail, query, or connection information.
 */
export function getSafeSqlState(error: unknown): string | undefined {
  if (!(error instanceof postgres.PostgresError)) return undefined;

  const code = (error as Error & { code?: unknown }).code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  // Guard before importing the app database module, which creates the postgres client.
  // Never print databaseUrl, including when refusing a non-local target.
  if (!isLoopbackPostgresUrl(databaseUrl)) {
    console.log(JSON.stringify({
      status: 'refused',
      reason: 'DATABASE_URL is missing or is not a loopback PostgreSQL URL; no database connection was attempted.',
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const { queryClient } = await import('../src/db');
  if (!queryClient) {
    console.log(JSON.stringify({
      status: 'failed',
      reason: 'The local application database client is not configured.',
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const report: Record<string, unknown> = {
    target: 'loopback PostgreSQL only',
    schemaCheck: 'not-run',
    migrationHistoryCheck: 'not-run',
    homeFeedQuery: 'not-run',
  };
  let failed = false;

  try {
    let migrationHistoryExists = false;

    try {
      const schemaRows = await queryClient.unsafe<{
        profile_website_url_exists: boolean;
        migration_history_exists: boolean;
      }[]>(`
        SELECT
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'profiles'
              AND column_name = 'website_url'
          ) AS profile_website_url_exists,
          to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migration_history_exists
      `);

      const schema = schemaRows[0];
      migrationHistoryExists = Boolean(schema?.migration_history_exists);
      report.schemaCheck = 'passed';
      report.profilesWebsiteUrlColumnExists = Boolean(schema?.profile_website_url_exists);
      report.migrationHistoryTableExists = migrationHistoryExists;

      if (!schema?.profile_website_url_exists) failed = true;
    } catch (error) {
      report.schemaCheck = 'failed';
      report.schemaSqlState = getSafeSqlState(error) || 'unclassified';
      failed = true;
    }

    if (migrationHistoryExists) {
      try {
        const migrationRows = await queryClient.unsafe<{
          migration_0004_or_later_recorded: boolean;
        }[]>(`
          SELECT EXISTS (
            SELECT 1
            FROM drizzle.__drizzle_migrations
            WHERE created_at >= ${MIGRATION_0004_TIMESTAMP}
          ) AS migration_0004_or_later_recorded
        `);

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
      const { getHomeFeedListings } = await import('../src/app/services/listingService');
      const cards = await getHomeFeedListings(6);
      report.homeFeedQuery = 'passed';
      report.returnedListingCount = cards.length;
    } catch (error) {
      report.homeFeedQuery = 'failed';
      report.homeFeedSqlState = getSafeSqlState(error) || 'unclassified';
      failed = true;
    }
  } finally {
    try {
      await queryClient.end({ timeout: 5 });
    } catch {
      // Do not print client shutdown errors or connection details.
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (failed) process.exitCode = 1;
}

const invokedFile = basename(process.argv[1] || '');
if (invokedFile === 'diagnoseLocalListingsDb.ts' || invokedFile === 'diagnoseLocalListingsDb.js') {
  void main().catch(() => {
    // Unexpected errors may include connection details. Emit only a generic result.
    console.log(JSON.stringify({
      status: 'failed',
      reason: 'The diagnostic failed before a safe report could be produced; raw error details were omitted.',
    }, null, 2));
    process.exitCode = 1;
  });
}
