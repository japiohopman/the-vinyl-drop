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
  // Drizzle wraps driver failures in an Error with the original postgres.js
  // error in `cause`. Walk a short, cycle-safe cause chain so the diagnostic
  // can report a validated SQLSTATE without exposing raw error text.
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (
      !current ||
      (typeof current !== 'object' && typeof current !== 'function') ||
      seen.has(current)
    ) {
      return undefined;
    }

    seen.add(current);

    if (current instanceof postgres.PostgresError) {
      const code = (current as Error & { code?: unknown }).code;
      return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
    }

    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return undefined;
}

/**
 * Returns only allowlisted error type labels from a bounded cause chain.
 * Never returns error messages, SQL, connection data, or arbitrary class names.
 */
export function getSafeErrorTypeChain(error: unknown): string[] {
  const seen = new Set<unknown>();
  const types: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (
      !current ||
      (typeof current !== 'object' && typeof current !== 'function') ||
      seen.has(current)
    ) {
      break;
    }

    seen.add(current);

    if (current instanceof postgres.PostgresError || (current instanceof Error && current.name === 'PostgresError')) {
      types.push('PostgresError');
    } else if (current instanceof Error) {
      const name = current.name;
      types.push(
        ['DrizzleQueryError', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'Error'].includes(name)
          ? name
          : 'OtherError'
      );
    } else {
      types.push('NonErrorObject');
    }

    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return types.length > 0 ? types : ['UnknownError'];
}

export type SafeErrorLocationSource =
  | 'listingService'
  | 'listingRepository'
  | 'listingCardViewModel'
  | 'dbSchema'
  | 'drizzle-orm'
  | 'postgres.js'
  | 'node_modules'
  | 'runtime';

export interface SafeErrorLocation {
  source: SafeErrorLocationSource;
  line: number;
  column: number;
}

/**
 * Extract allowlisted source labels and positions from stack frames only.
 * Error messages, function names, absolute paths, and SQL are never returned.
 */
export function getSafeErrorLocations(error: unknown): SafeErrorLocation[] {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return [];

  const locations: SafeErrorLocation[] = [];
  const seen = new Set<string>();

  // Inspect a bounded stack window, but do not stop at the first six frames:
  // dependency/runtime frames can precede the application frame that matters.
  for (const rawFrame of error.stack.split('\n').slice(1, 25)) {
    let frame = rawFrame.trim();
    const openParen = frame.lastIndexOf('(');
    if (openParen >= 0) frame = frame.slice(openParen + 1).replace(/\)?$/, '');
    frame = frame.replace(/^at\s+/, '').replace(/^file:\/\/\//i, '');

    const lastColon = frame.lastIndexOf(':');
    const previousColon = frame.lastIndexOf(':', lastColon - 1);
    if (lastColon < 0 || previousColon < 0) continue;

    const lineText = frame.slice(previousColon + 1, lastColon);
    const columnText = frame.slice(lastColon + 1);
    if (!/^\d+$/.test(lineText) || !/^\d+$/.test(columnText)) continue;

    const filePath = frame.slice(0, previousColon).replace(/\\/g, '/').toLowerCase();
    const line = Number(lineText);
    const column = Number(columnText);
    if (!filePath || !Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) continue;

    let source: SafeErrorLocationSource = 'runtime';
    if (filePath.includes('/src/app/services/listingservice.')) source = 'listingService';
    else if (filePath.includes('/src/app/repositories/listingrepository.')) source = 'listingRepository';
    else if (filePath.includes('/src/app/view-models/listingcardviewmodel.')) source = 'listingCardViewModel';
    else if (filePath.includes('/src/db/schema/')) source = 'dbSchema';
    else if (filePath.includes('/node_modules/drizzle-orm/')) source = 'drizzle-orm';
    else if (filePath.includes('/node_modules/postgres/')) source = 'postgres.js';
    else if (filePath.includes('/node_modules/')) source = 'node_modules';

    const key = `${source}:${line}:${column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ source, line, column });
  }

  // Prefer our own code when it appears deeper in the stack; keep all exposed
  // values limited to fixed source labels and numeric positions.
  const sourcePriority: Record<SafeErrorLocationSource, number> = {
    listingRepository: 0,
    listingService: 1,
    listingCardViewModel: 2,
    dbSchema: 3,
    'drizzle-orm': 4,
    'postgres.js': 5,
    node_modules: 6,
    runtime: 7,
  };

  return locations
    .sort((a, b) => sourcePriority[a.source] - sourcePriority[b.source])
    .slice(0, 6);
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
