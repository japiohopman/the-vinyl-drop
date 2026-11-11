import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import postgres from 'postgres';
import { getPostgresConnectionOptions } from '../src/db/connectionOptions';

const EXPECTED_PROJECT_REF = 'anxhmlalxjvatrufcjei';
const EXPECTED_POOLER_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
const BASELINE_LAST_INDEX = 23;

const EXPECTED_BASELINE_TAGS = [
  '0000_grey_living_tribunal',
  '0001_add_physical_copies',
  '0002_add_release_cover_art',
  '0003_brainy_scarlet_witch',
  '0004_mighty_spacker_dave',
  '0005_enforce_least_privilege_rls',
  '0006_storage_objects_rls',
  '0007_add_orphaned_storage_objects',
  '0008_private_conversations_messages',
  '0009_case_insensitive_usernames',
  '0010_supabase_data_api_read_only',
  '0011_password_checked_signup_hook',
  '0012_pin_messaging_trigger_search_path',
  '0013_private_registration_consents',
  '0014_add_listing_photo_roles',
  '0015_dismiss_completed_listings',
  '0016_direct_conversations_and_sequence_cursor',
  '0017_saved_people',
  '0018_add_release_youtube_preview',
  '0019_shared_rate_limit_buckets',
  '0020_catalogue_search_trigram',
  '0021_release_metadata_vocabulary',
  '0022_listing_photo_source_versions',
  '0023_block_new_google_oauth_identities',
] as const;

type MigrationJournalEntry = {
  idx?: unknown;
  tag?: unknown;
  when?: unknown;
};

type MigrationJournal = {
  version?: unknown;
  dialect?: unknown;
  entries?: unknown;
};

type LedgerRow = {
  created_at: unknown;
};

export type ProductionMigrationBaseline = {
  timestamps: string[];
  latestTag: string;
};

export function getExpectedProductionMigrationBaseline(
  journal: unknown,
): ProductionMigrationBaseline {
  if (!journal || typeof journal !== 'object') {
    throw new Error('Repository migration journal is not an object.');
  }

  const candidate = journal as MigrationJournal;
  if (candidate.version !== '7' || candidate.dialect !== 'postgresql' || !Array.isArray(candidate.entries)) {
    throw new Error('Repository migration journal version, dialect or entries are invalid.');
  }

  const entries = candidate.entries as MigrationJournalEntry[];
  const timestamps: string[] = [];
  let previousTimestamp = 0;

  for (let index = 0; index <= BASELINE_LAST_INDEX; index += 1) {
    const matches = entries.filter((entry) => Number(entry?.idx) === index);
    if (matches.length !== 1) {
      throw new Error(`Repository migration journal index ${index} must occur exactly once.`);
    }

    const entry = matches[0];
    const expectedTag = EXPECTED_BASELINE_TAGS[index];
    if (entry.tag !== expectedTag) {
      throw new Error(`Repository migration journal index ${index} does not match the pinned migration tag.`);
    }

    const timestamp = Number(entry.when);
    if (!Number.isSafeInteger(timestamp) || timestamp <= previousTimestamp) {
      throw new Error(`Repository migration journal timestamp at index ${index} is invalid or out of order.`);
    }

    timestamps.push(String(timestamp));
    previousTimestamp = timestamp;
  }

  return {
    timestamps,
    latestTag: EXPECTED_BASELINE_TAGS[BASELINE_LAST_INDEX],
  };
}

export function validateProductionMigrationLedger(
  expectedTimestamps: readonly string[],
  rows: readonly LedgerRow[],
): string[] {
  const problems: string[] = [];
  if (expectedTimestamps.length !== BASELINE_LAST_INDEX + 1) {
    return ['The pinned production baseline does not contain exactly 24 migration timestamps.'];
  }

  const actualTimestamps = rows.map((row) => String(row.created_at ?? ''));
  if (actualTimestamps.some((timestamp) => !/^\d+$/.test(timestamp))) {
    problems.push('The production Drizzle ledger contains an invalid migration timestamp.');
    return problems;
  }

  if (actualTimestamps.length !== expectedTimestamps.length) {
    problems.push(`Expected exactly 24 production Drizzle ledger rows; found ${actualTimestamps.length}.`);
  }

  const actualCounts = new Map<string, number>();
  for (const timestamp of actualTimestamps) {
    actualCounts.set(timestamp, (actualCounts.get(timestamp) ?? 0) + 1);
  }

  if ([...actualCounts.values()].some((count) => count > 1)) {
    problems.push('The production Drizzle ledger contains duplicate migration timestamps.');
  }

  const expectedSet = new Set(expectedTimestamps);
  const actualSet = new Set(actualTimestamps);
  if (expectedTimestamps.some((timestamp) => !actualSet.has(timestamp))) {
    problems.push('The production Drizzle ledger is missing one or more expected migrations.');
  }
  if (actualTimestamps.some((timestamp) => !expectedSet.has(timestamp))) {
    problems.push('The production Drizzle ledger contains an unexpected migration timestamp.');
  }

  const sortedActual = [...actualTimestamps].sort((left, right) => Number(left) - Number(right));
  if (
    sortedActual.length === expectedTimestamps.length &&
    sortedActual.some((timestamp, index) => timestamp !== expectedTimestamps[index])
  ) {
    problems.push('The production Drizzle ledger does not match the exact ordered 0000-0023 baseline.');
  }

  return problems;
}

function getApprovedProductionConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing.');

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.PRODUCTION_DB_PROJECT_REF !== EXPECTED_PROJECT_REF ||
    process.env.TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF !== EXPECTED_PROJECT_REF ||
    process.env.PRODUCTION_DB_HOST !== EXPECTED_POOLER_HOST
  ) {
    throw new Error('The process-only production target confirmation does not match the approved project.');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL.');
  }

  let username: string;
  try {
    username = decodeURIComponent(url.username);
  } catch {
    throw new Error('DATABASE_URL contains invalid credentials encoding.');
  }

  const queryParameters = [...url.searchParams.entries()];
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname.toLowerCase() !== EXPECTED_POOLER_HOST ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    username !== `postgres.${EXPECTED_PROJECT_REF}` ||
    !url.password ||
    queryParameters.length !== 1 ||
    queryParameters[0][0] !== 'sslmode' ||
    queryParameters[0][1] !== 'require' ||
    url.hash
  ) {
    throw new Error('DATABASE_URL does not identify the approved production session pooler with TLS required.');
  }

  return connectionString;
}

async function main(): Promise<void> {
  const connectionString = getApprovedProductionConnectionString();
  const journalPath = resolve(process.cwd(), 'drizzle/meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as unknown;
  const baseline = getExpectedProductionMigrationBaseline(journal);

  const client = postgres(connectionString, {
    ...getPostgresConnectionOptions('production'),
    max: 1,
    connect_timeout: 8,
    idle_timeout: 15,
    prepare: false,
    connection: { application_name: 'tvd-production-migration-baseline-preflight' },
  });

  try {
    const rows = await client.begin('read only', async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
      await tx.unsafe("SET LOCAL lock_timeout = '2000ms'");
      return tx.unsafe<LedgerRow[]>(
        'SELECT created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
      );
    });

    const problems = validateProductionMigrationLedger(baseline.timestamps, rows);
    if (problems.length > 0) {
      throw new Error('Production migration baseline preflight failed: ' + problems.join(' '));
    }

    console.log(JSON.stringify({
      status: 'passed',
      target: 'approved production project',
      ledgerRows: rows.length,
      verifiedThrough: baseline.latestTag,
      readOnly: true,
    }, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

const invokedFile = basename(process.argv[1] || '').toLowerCase();
if (
  invokedFile === 'verifyproductionmigrationbaseline.ts' ||
  invokedFile === 'verifyproductionmigrationbaseline.js'
) {
  void main().catch((error: unknown) => {
    const reason = error instanceof Error && (
      error.message.startsWith('Production migration baseline preflight failed:') ||
      error.message.startsWith('Repository migration journal')
    )
      ? error.message
      : 'The read-only production migration baseline could not be verified; migration execution is blocked.';
    console.error(JSON.stringify({ status: 'failed', reason }, null, 2));
    process.exitCode = 1;
  });
}
