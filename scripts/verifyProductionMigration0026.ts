import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import postgres from 'postgres';
import { getPostgresConnectionOptions } from '../src/db/connectionOptions';

const EXPECTED_PROJECT_REF = 'anxhmlalxjvatrufcjei';
const EXPECTED_POOLER_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
// Independently approved canonical-LF SHA-256 of migration 0026.
const EXPECTED_MIGRATION_0026_SQL_SHA256 = '225a33bb06f21519a3a73c32a6765b4ed0da1dda5632df3c49e8894a44f6633b';
const EXPECTED_SPECIAL_PRESSING_CHECK =
  'CHECK ((((special_pressing = false) AND (cardinality(special_pressing_characteristics) = 0) AND (special_pressing_details IS NULL)) OR ((special_pressing = true) AND (cardinality(special_pressing_characteristics) > 0))))';
const EXPECTED_TAGS = [
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
  '0024_profile_avatars_and_music_links',
  '0025_add_release_styles',
  '0026_release_content_type_and_special_pressing',
] as const;

type JournalEntry = { idx?: unknown; tag?: unknown; when?: unknown };
type Journal = { version?: unknown; dialect?: unknown; entries?: unknown };
type LedgerRow = { created_at: unknown; hash: unknown };

export type ExpectedMigration0026Entry = {
  idx: number;
  tag: string;
  timestamp: string;
  acceptedHashes: string[];
};

export type Migration0026Mode = 'preflight' | 'complete';

export type Migration0026SchemaSnapshot = {
  enums: Array<{ name: string; labels: string[] }>;
  columns: Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>;
  indexes: string[];
  constraint: { convalidated: boolean; definition: string } | null;
};

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function getAcceptedHashes(sql: string): string[] {
  const lf = sql.replace(/\r\n?/g, '\n');
  return [...new Set([sha256(sql), sha256(lf), sha256(lf.replace(/\n/g, '\r\n'))])];
}

/**
 * Normalizes formatting and unquoted SQL keywords/identifiers while preserving
 * the contents and case of single-quoted string literals.
 */
export function normalizePostgresExpression(expression: string): string {
  let normalized = '';
  let inSingleQuotedString = false;

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];

    if (character === "'") {
      normalized += character;
      if (inSingleQuotedString && expression[index + 1] === "'") {
        normalized += expression[index + 1];
        index += 1;
      } else {
        inSingleQuotedString = !inSingleQuotedString;
      }
      continue;
    }

    if (!inSingleQuotedString && /\s/.test(character)) continue;
    normalized += inSingleQuotedString ? character : character.toLowerCase();
  }

  return normalized;
}

/**
 * Pins the actual 0026 SQL bytes to an independently reviewed SHA-256.
 * CRLF and LF checkouts are equivalent after newline-only normalization.
 */
export function assertApprovedMigration0026Sql(sql: string): void {
  const actualHash = sha256(sql.replace(/\r\n?/g, '\n'));
  if (actualHash !== EXPECTED_MIGRATION_0026_SQL_SHA256) {
    throw new Error('Migration 0026 SQL does not match the independently pinned approved SHA-256.');
  }
}

/**
 * Validates the complete repository journal through index 26 and hashes every
 * approved SQL file. Missing, duplicate, replaced or later journal entries fail closed.
 */
export function getExpectedProductionMigration0026Entries(
  journal: unknown,
  migrationDirectory = resolve(process.cwd(), 'drizzle'),
): ExpectedMigration0026Entry[] {
  if (!journal || typeof journal !== 'object') {
    throw new Error('Repository migration journal is not an object.');
  }

  const candidate = journal as Journal;
  if (candidate.version !== '7' || candidate.dialect !== 'postgresql' || !Array.isArray(candidate.entries)) {
    throw new Error('Repository migration journal version, dialect or entries are invalid.');
  }

  const entries = candidate.entries as JournalEntry[];
  if (entries.length !== EXPECTED_TAGS.length) {
    throw new Error('Repository migration journal must contain exactly the pinned 0000-0026 prefix.');
  }

  const expected: ExpectedMigration0026Entry[] = [];
  let previousTimestamp = 0;

  for (let index = 0; index < EXPECTED_TAGS.length; index += 1) {
    if (entries[index]?.idx !== index) {
      throw new Error('Repository migration journal entries must remain in exact ascending index order.');
    }
    const matches = entries.filter((entry) => entry?.idx === index);
    if (matches.length !== 1) {
      throw new Error(`Repository migration journal index ${index} must occur exactly once.`);
    }

    const entry = matches[0];
    const tag = EXPECTED_TAGS[index];
    if (entry.tag !== tag) {
      throw new Error(`Repository migration journal index ${index} does not match the pinned migration tag.`);
    }

    const timestamp = Number(entry.when);
    if (!Number.isSafeInteger(timestamp) || timestamp <= previousTimestamp) {
      throw new Error(`Repository migration journal timestamp at index ${index} is invalid or out of order.`);
    }

    const sqlPath = resolve(migrationDirectory, `${tag}.sql`);
    const sql = readFileSync(sqlPath, 'utf8');
    if (index === 26) assertApprovedMigration0026Sql(sql);
    expected.push({
      idx: index,
      tag,
      timestamp: String(timestamp),
      acceptedHashes: getAcceptedHashes(sql),
    });
    previousTimestamp = timestamp;
  }

  return expected;
}

/**
 * Requires an exact ordered Drizzle ledger. In preflight mode the approved
 * baseline ends at 0025; in complete mode it includes exactly 0026.
 */
export function validateProductionMigration0026Ledger(
  expected: readonly ExpectedMigration0026Entry[],
  rows: readonly LedgerRow[],
  mode: Migration0026Mode,
): string[] {
  const problems: string[] = [];
  if (expected.length !== 27 || expected[26]?.tag !== '0026_release_content_type_and_special_pressing') {
    return ['The pinned migration plan does not contain exactly the approved 0000-0026 prefix.'];
  }

  const required = mode === 'preflight' ? expected.slice(0, 26) : expected;
  if (rows.length !== required.length) {
    problems.push(`Expected exactly ${required.length} Drizzle ledger rows for ${mode}; found ${rows.length}.`);
  }

  const timestamps = rows.map((row) => String(row.created_at ?? ''));
  if (timestamps.some((timestamp) => !/^\d+$/.test(timestamp))) {
    problems.push('The Drizzle ledger contains an invalid migration timestamp.');
    return problems;
  }

  const seen = new Set<string>();
  for (let index = 0; index < Math.min(rows.length, required.length); index += 1) {
    const migration = required[index];
    const actualTimestamp = timestamps[index];
    const actualHash = String(rows[index].hash ?? '').toLowerCase();

    if (seen.has(actualTimestamp)) {
      problems.push('The Drizzle ledger contains duplicate migration timestamps.');
    }
    seen.add(actualTimestamp);

    if (actualTimestamp !== migration.timestamp) {
      problems.push(`Drizzle ledger index ${index} does not match the exact approved migration timestamp/order.`);
    }
    if (!/^[a-f0-9]{64}$/.test(actualHash)) {
      problems.push(`Drizzle migration index ${index} has an invalid SHA-256 ledger hash.`);
    } else if (!migration.acceptedHashes.includes(actualHash)) {
      problems.push(`Drizzle migration index ${index} (${migration.tag}) hash does not match its approved SQL file.`);
    }
  }

  return [...new Set(problems)];
}

export function getProductionMigration0026SchemaProblems(
  snapshot: Migration0026SchemaSnapshot,
  mode: Migration0026Mode,
  requireValidatedConstraint = mode === 'complete',
): string[] {
  const problems: string[] = [];
  const enumMap = new Map(snapshot.enums.map((item) => [item.name, item.labels]));
  const columnMap = new Map(snapshot.columns.map((item) => [`${item.table_name}.${item.column_name}`, item]));
  const hasConstraint = snapshot.constraint !== null;

  // The previously approved 0024-0025 schema must still be present.
  for (const name of [
    'profiles.avatar_storage_path',
    'profiles.soundcloud_url',
    'profiles.mixcloud_url',
    'releases.styles',
    'releases.canonical_styles',
  ]) {
    if (!columnMap.has(name)) problems.push(`The verified 0024-0025 baseline is missing ${name}.`);
  }
  for (const name of ['profiles_avatar_storage_path_unique_idx', 'releases_canonical_styles_idx']) {
    if (!snapshot.indexes.includes(name)) problems.push(`The verified 0024-0025 baseline is missing index ${name}.`);
  }

  const expectedEnums = {
    release_content_type: ['music', 'non_music'],
    special_pressing_characteristic: [
      'picture_disc',
      'solid_colour',
      'translucent',
      'multi_colour',
      'splatter',
      'marble',
      'glitter',
      'glow_in_the_dark',
      'metallic',
      'shaped',
    ],
  };

  if (mode === 'preflight') {
    for (const name of Object.keys(expectedEnums)) {
      if (enumMap.has(name)) problems.push(`The 0026 enum ${name} already exists before migration.`);
    }
    for (const name of [
      'releases.content_type',
      'physical_copies.special_pressing',
      'physical_copies.special_pressing_characteristics',
      'physical_copies.special_pressing_details',
    ]) {
      if (columnMap.has(name)) problems.push(`The 0026 column ${name} already exists before migration.`);
    }
    if (hasConstraint) problems.push('The 0026 Special Pressing CHECK already exists before migration.');
    return problems;
  }

  for (const [name, labels] of Object.entries(expectedEnums)) {
    const actual = enumMap.get(name);
    if (!actual || actual.join(',') !== labels.join(',')) {
      problems.push(`The 0026 enum ${name} is missing or does not match its exact ordered labels.`);
    }
  }

  const expectedColumns: Array<{
    name: string;
    dataType: string;
    udtName: string;
    nullable: string;
    defaultExpression: string | null;
  }> = [
    {
      name: 'releases.content_type',
      dataType: 'USER-DEFINED',
      udtName: 'release_content_type',
      nullable: 'NO',
      defaultExpression: "'music'::release_content_type",
    },
    {
      name: 'physical_copies.special_pressing',
      dataType: 'boolean',
      udtName: 'bool',
      nullable: 'NO',
      defaultExpression: 'false',
    },
    {
      name: 'physical_copies.special_pressing_characteristics',
      dataType: 'ARRAY',
      udtName: '_special_pressing_characteristic',
      nullable: 'NO',
      defaultExpression: "'{}'::special_pressing_characteristic[]",
    },
    {
      name: 'physical_copies.special_pressing_details',
      dataType: 'text',
      udtName: 'text',
      nullable: 'YES',
      defaultExpression: null,
    },
  ];

  for (const expectedColumn of expectedColumns) {
    const actual = columnMap.get(expectedColumn.name);
    const actualDefault = actual?.column_default;
    const defaultMatches = expectedColumn.defaultExpression === null
      ? actualDefault === null
      : actualDefault !== null &&
        normalizePostgresExpression(actualDefault) === normalizePostgresExpression(expectedColumn.defaultExpression);
    if (
      !actual ||
      actual.data_type !== expectedColumn.dataType ||
      actual.udt_name !== expectedColumn.udtName ||
      actual.is_nullable !== expectedColumn.nullable ||
      !defaultMatches
    ) {
      problems.push(`The 0026 column ${expectedColumn.name} does not match its approved type/default/nullability.`);
    }
  }

  if (!snapshot.constraint) {
    problems.push('The Special Pressing consistency CHECK is missing.');
  } else {
    if (
      normalizePostgresExpression(snapshot.constraint.definition) !==
      normalizePostgresExpression(EXPECTED_SPECIAL_PRESSING_CHECK)
    ) {
      problems.push('The Special Pressing consistency CHECK does not match the exact approved constraint definition.');
    }
    if (requireValidatedConstraint && !snapshot.constraint.convalidated) {
      problems.push('The Special Pressing consistency CHECK is not validated.');
    }
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
    throw new Error('DATABASE_URL does not identify the approved production Shared Session Pooler with TLS required.');
  }

  return connectionString;
}

async function readLedger(
  client: ReturnType<typeof postgres>,
): Promise<LedgerRow[]> {
  return client.begin('read only', async (tx) => {
    await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
    await tx.unsafe("SET LOCAL lock_timeout = '2000ms'");
    return tx.unsafe<LedgerRow[]>(
      'SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
    );
  });
}

async function readSchemaSnapshot(
  client: ReturnType<typeof postgres>,
): Promise<Migration0026SchemaSnapshot> {
  return client.begin('read only', async (tx) => {
    await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
    const enums = await tx.unsafe<Array<{ name: string; labels: string[] }>>(
      `SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typname IN ('release_content_type', 'special_pressing_characteristic')
       GROUP BY t.typname ORDER BY t.typname;`,
    );
    const columns = await tx.unsafe<Migration0026SchemaSnapshot['columns']>(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'profiles' AND column_name IN ('avatar_storage_path', 'soundcloud_url', 'mixcloud_url')) OR
           (table_name = 'releases' AND column_name IN ('styles', 'canonical_styles', 'content_type')) OR
           (table_name = 'physical_copies' AND column_name IN ('special_pressing', 'special_pressing_characteristics', 'special_pressing_details'))
         )
       ORDER BY table_name, column_name;`,
    );
    const indexes = await tx.unsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN ('profiles_avatar_storage_path_unique_idx', 'releases_canonical_styles_idx')
       ORDER BY indexname;`,
    );
    const constraints = await tx.unsafe<Array<{ convalidated: boolean; definition: string }>>(
      `SELECT convalidated, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'physical_copies_special_pressing_check'
         AND conrelid = 'public.physical_copies'::regclass;`,
    );
    return {
      enums,
      columns,
      indexes: indexes.map((row) => row.indexname),
      constraint: constraints.length === 1 ? constraints[0] : null,
    };
  });
}

/**
 * Complete mode runs only after Drizzle reports success. If the check is still
 * NOT VALID, validate it in a bounded transaction, then re-read and verify it.
 * This preserves the migration's short transaction and makes the exact
 * post-commit validation a visible, independently checked step.
 */
async function validateSpecialPressingConstraint(
  client: ReturnType<typeof postgres>,
): Promise<void> {
  const snapshot = await readSchemaSnapshot(client);
  if (!snapshot.constraint) throw new Error('The Special Pressing consistency CHECK is missing after migration.');
  if (snapshot.constraint.convalidated) return;

  await client.begin(async (tx) => {
    await tx.unsafe("SET LOCAL lock_timeout = '5000ms'");
    await tx.unsafe("SET LOCAL statement_timeout = '30000ms'");
    await tx.unsafe(
      'ALTER TABLE public.physical_copies VALIDATE CONSTRAINT physical_copies_special_pressing_check;',
    );
  });

  const verified = await readSchemaSnapshot(client);
  if (!verified.constraint?.convalidated) {
    throw new Error('The Special Pressing consistency CHECK could not be independently validated.');
  }
}

async function main(): Promise<void> {
  const [mode, migrationSqlPath] = process.argv.slice(2);
  if (
    process.argv.length < 3 ||
    process.argv.length > 4 ||
    (mode !== 'preflight' && mode !== 'complete')
  ) {
    throw new Error('Usage: verifyProductionMigration0026.ts <preflight|complete> [copied-migration-sql-path]');
  }

  if (migrationSqlPath) {
    const copiedMigrationSql = readFileSync(resolve(process.cwd(), migrationSqlPath), 'utf8');
    assertApprovedMigration0026Sql(copiedMigrationSql);
  }

  const connectionString = getApprovedProductionConnectionString();
  const journalPath = resolve(process.cwd(), 'drizzle/meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as unknown;
  const expected = getExpectedProductionMigration0026Entries(journal);
  const client = postgres(connectionString, {
    ...getPostgresConnectionOptions('production'),
    max: 1,
    connect_timeout: 8,
    idle_timeout: 15,
    prepare: false,
    connection: { application_name: 'tvd-production-migration-0026-preflight' },
  });

  try {
    const rows = await readLedger(client);
    const ledgerProblems = validateProductionMigration0026Ledger(expected, rows, mode);
    if (ledgerProblems.length > 0) {
      throw new Error(ledgerProblems.join(' '));
    }

    const snapshot = await readSchemaSnapshot(client);
    const schemaProblems = getProductionMigration0026SchemaProblems(snapshot, mode, mode === 'complete' && snapshot.constraint?.convalidated === true);
    if (schemaProblems.length > 0) {
      throw new Error(schemaProblems.join(' '));
    }

    if (mode === 'complete') {
      await validateSpecialPressingConstraint(client);
      const verifiedSnapshot = await readSchemaSnapshot(client);
      const finalProblems = getProductionMigration0026SchemaProblems(verifiedSnapshot, 'complete', true);
      if (finalProblems.length > 0) throw new Error(finalProblems.join(' '));

      console.log(JSON.stringify({
        status: 'passed',
        target: 'approved production project',
        ledgerRows: rows.length,
        verifiedThrough: '0026_release_content_type_and_special_pressing',
        specialPressingConstraintValidated: true,
        schemaVerified: true,
        migrationAppliedByDrizzle: true,
      }, null, 2));
      return;
    }

    console.log(JSON.stringify({
      status: 'passed',
      target: 'approved production project',
      ledgerRows: rows.length,
      verifiedThrough: '0025_add_release_styles',
      migration0026Absent: true,
      schemaBaselineVerified: true,
      readOnly: true,
    }, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

const invokedFile = basename(process.argv[1] || '').toLowerCase();
if (
  invokedFile === 'verifyproductionmigration0026.ts' ||
  invokedFile === 'verifyproductionmigration0026.js'
) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    const reason = message.startsWith('The process-only production target') ||
      message.startsWith('DATABASE_URL') ||
      message.startsWith('Repository migration journal') ||
      message.startsWith('The pinned migration plan') ||
      message.startsWith('Expected exactly') ||
      message.startsWith('Drizzle ledger') ||
      message.startsWith('The 0026') ||
      message.startsWith('The Special Pressing') ||
      message.startsWith('The verified 0024-0025') ||
      message.startsWith('The Drizzle ledger') ||
      message.startsWith('Usage:')
      ? message
      : 'The production migration 0026 verification failed; the runner must stop without retrying.';
    console.error(JSON.stringify({ status: 'failed', reason }, null, 2));
    process.exitCode = 1;
  });
}
