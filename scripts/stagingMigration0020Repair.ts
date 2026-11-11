import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import postgres from 'postgres';

export const STAGING_PROJECT_REF = 'xuhzhdjmgvqzjxijmksu';
export const STAGING_POOLER_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
export const PRODUCTION_PROJECT_REF = 'anxhmlalxjvatrufcjei';
export const REPAIR_CONFIRMATION = 'REPAIR-STAGING-MIGRATION-0020 ' + STAGING_PROJECT_REF;
export const MIGRATION_INDEX = 20;
export const MIGRATION_TAG = '0020_catalogue_search_trigram';
export const MIGRATION_TIMESTAMP = 1793510400000;

export const EXPECTED_INDEXES = {
  releases_artist_trgm_idx: {
    column: 'artist',
    sql: 'CREATE INDEX releases_artist_trgm_idx ON public.releases USING GIN (artist extensions.gin_trgm_ops);',
  },
  releases_title_trgm_idx: {
    column: 'title',
    sql: 'CREATE INDEX releases_title_trgm_idx ON public.releases USING GIN (title extensions.gin_trgm_ops);',
  },
  releases_label_trgm_idx: {
    column: 'label',
    sql: 'CREATE INDEX releases_label_trgm_idx ON public.releases USING GIN (label extensions.gin_trgm_ops);',
  },
} as const;

export type StagingTargetInput = {
  projectRef?: string;
  stagingHost?: string;
  connectionUrl?: string;
};

export type LedgerRow = {
  id: number | string;
  hash: string;
  created_at: number | string;
};

export type IndexState = {
  index_schema: string;
  index_name: string;
  table_schema: string;
  table_name: string;
  access_method: string;
  column_name: string | null;
  attribute_count: number;
  key_attribute_count: number;
  has_predicate: boolean;
  is_unique: boolean;
  is_primary: boolean;
  opclass_name: string;
  opclass_schema: string;
  is_valid: boolean;
  is_ready: boolean;
};

export type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

export type RepairSnapshot = {
  databaseName: string;
  ledgerTableExists: boolean;
  releasesTableExists: boolean;
  extensionsSchemaExists: boolean;
  extension: { name: string; schemaName: string; version: string } | null;
  ledgerRows: LedgerRow[];
  indexes: IndexState[];
};

export type RepairPlan = {
  status: 'blocked' | 'ready-to-repair' | 'already-complete';
  reasons: string[];
  expectedTimestamp: number;
  expectedMigrationHash: string;
  needsExtensionSchema: boolean;
  needsExtension: boolean;
  indexesToCreate: Array<keyof typeof EXPECTED_INDEXES>;
  needsLedgerRecord: boolean;
};

type QueryExecutor = {
  unsafe(query: string, parameters?: unknown[]): Promise<unknown[]>;
};

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim().toLowerCase();
}

function timestampOf(value: number | string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

export function isContinuousIntegrationEnvironment(environment: NodeJS.ProcessEnv): boolean {
  const indicators = [
    environment.CI,
    environment.CONTINUOUS_INTEGRATION,
    environment.GITHUB_ACTIONS,
    environment.GITHUB_RUN_ID,
    environment.GITLAB_CI,
    environment.BUILDKITE,
    environment.TF_BUILD,
    environment.JENKINS_URL,
  ];

  return indicators.some((value) => {
    if (value === undefined) return false;
    const normalized = value.trim().toLowerCase();
    return !['', '0', 'false', 'no', 'off'].includes(normalized);
  });
}

export function validateStagingConnectionTarget(input: StagingTargetInput): string[] {
  const problems: string[] = [];

  if (input.projectRef !== STAGING_PROJECT_REF) {
    problems.push('STAGING_DB_PROJECT_REF must exactly match the approved staging project.');
  }

  if (!input.connectionUrl) {
    problems.push('DATABASE_DIRECT_URL or DATABASE_URL is required.');
    return problems;
  }

  try {
    const url = new URL(input.connectionUrl);
    const username = decodeURIComponent(url.username);
    const hostname = url.hostname.toLowerCase();
    const isPooler = hostname === STAGING_POOLER_HOST;
    const isDirect = hostname === 'db.' + STAGING_PROJECT_REF + '.supabase.co';

    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      problems.push('The selected database URL must use PostgreSQL.');
    }

    if (!isPooler && !isDirect) {
      problems.push('The selected database URL does not identify the approved staging database host.');
    }

    if (input.stagingHost?.toLowerCase() !== hostname) {
      problems.push('STAGING_DB_HOST must exactly match the selected database URL host.');
    }

    if (url.port !== '5432') {
      problems.push('The staging migration connection must use port 5432.');
    }

    if (url.pathname !== '/postgres' || url.hash) {
      problems.push('The staging migration connection must target only the postgres database without a URL fragment.');
    }

    if (!url.password) {
      problems.push('The staging migration connection is missing its password.');
    }

    if (isPooler && username !== 'postgres.' + STAGING_PROJECT_REF) {
      problems.push('The pooler username must identify the approved staging project.');
    }

    if (isDirect && username !== 'postgres') {
      problems.push('The direct connection username must be postgres.');
    }

    const queryKeys = [...url.searchParams.keys()];
    if (
      queryKeys.some((key) => key !== 'sslmode') ||
      url.searchParams.getAll('sslmode').length > 1 ||
      (url.searchParams.has('sslmode') && url.searchParams.get('sslmode') !== 'require')
    ) {
      problems.push('The connection URL may contain only one optional sslmode=require parameter.');
    }
  } catch {
    problems.push('The selected database connection is not a valid PostgreSQL URL.');
  }

  return problems;
}

function validateJournal(entries: JournalEntry[]): string[] {
  const problems: string[] = [];
  const prefix = entries.filter((entry) => Number.isInteger(entry.idx) && entry.idx <= 25).sort((a, b) => a.idx - b.idx);

  if (prefix.length !== 26) {
    problems.push('The migration journal must contain the complete known prefix through migration 0025.');
    return problems;
  }

  let previousTimestamp = 0;
  for (let index = 0; index <= 25; index += 1) {
    const entry = prefix[index];
    if (entry.idx !== index) {
      problems.push('The migration journal has a missing, duplicate or reordered entry in its known prefix.');
      break;
    }
    if (!Number.isSafeInteger(entry.when) || entry.when <= previousTimestamp) {
      problems.push('The migration journal timestamps are not strictly increasing.');
      break;
    }
    previousTimestamp = entry.when;
  }

  const target = prefix[MIGRATION_INDEX];
  if (target?.tag !== MIGRATION_TAG || target.when !== MIGRATION_TIMESTAMP) {
    problems.push('Migration 0020 does not match the pinned tag and journal timestamp.');
  }

  return problems;
}

function validateMigrationSql(migrationSql: string): string[] {
  const expected = [
    'CREATE SCHEMA IF NOT EXISTS extensions;',
    'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;',
    EXPECTED_INDEXES.releases_artist_trgm_idx.sql,
    EXPECTED_INDEXES.releases_title_trgm_idx.sql,
    EXPECTED_INDEXES.releases_label_trgm_idx.sql,
  ].map(normalizeSql);

  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.replace(/^\s*(?:--[^\n]*\n)*/, '').trim())
    .filter(Boolean)
    .map(normalizeSql);

  if (statements.length !== expected.length || statements.some((statement, index) => statement !== expected[index])) {
    return ['The checked-in migration 0020 SQL does not match the reviewed schema/index statements.'];
  }

  return [];
}

function isCorrectIndex(index: IndexState, expectedName: keyof typeof EXPECTED_INDEXES): boolean {
  return (
    index.index_schema === 'public' &&
    index.index_name === expectedName &&
    index.table_schema === 'public' &&
    index.table_name === 'releases' &&
    index.access_method === 'gin' &&
    index.column_name === EXPECTED_INDEXES[expectedName].column &&
    index.attribute_count === 1 &&
    index.key_attribute_count === 1 &&
    index.has_predicate === false &&
    index.is_unique === false &&
    index.is_primary === false &&
    index.opclass_name === 'gin_trgm_ops' &&
    index.opclass_schema === 'extensions' &&
    index.is_valid === true &&
    index.is_ready === true
  );
}

export function buildStagingMigration0020Plan(
  snapshot: RepairSnapshot,
  journalEntries: JournalEntry[],
  expectedMigrationHash: string,
  migrationSql?: string,
): RepairPlan {
  const reasons = [...validateJournal(journalEntries)];
  if (migrationSql !== undefined) {
    reasons.push(...validateMigrationSql(migrationSql));
  }

  if (!/^[a-f0-9]{64}$/i.test(expectedMigrationHash)) {
    reasons.push('The computed migration 0020 SHA-256 hash is invalid.');
  }
  if (snapshot.databaseName !== 'postgres') {
    reasons.push('The connected database is not the expected postgres database.');
  }
  if (!snapshot.ledgerTableExists) {
    reasons.push('The Drizzle migration ledger table is missing.');
  }
  if (!snapshot.releasesTableExists) {
    reasons.push('The public.releases table is missing.');
  }

  const prefix = journalEntries
    .filter((entry) => Number.isInteger(entry.idx) && entry.idx <= 25)
    .sort((a, b) => a.idx - b.idx);
  const expectedEntries = prefix.filter((entry) => entry.idx !== MIGRATION_INDEX);
  const expectedTimestamps = new Set(expectedEntries.map((entry) => entry.when));
  const observedTimestamps = snapshot.ledgerRows.map((row) => timestampOf(row.created_at));
  const timestampCounts = new Map<number, number>();

  for (const timestamp of observedTimestamps) {
    timestampCounts.set(timestamp, (timestampCounts.get(timestamp) ?? 0) + 1);
  }

  if (snapshot.ledgerRows.some((row) => !/^[a-f0-9]{64}$/i.test(row.hash))) {
    reasons.push('The migration ledger contains a hash that is not a SHA-256 value.');
  }

  if (observedTimestamps.some((timestamp) => !expectedTimestamps.has(timestamp) && timestamp !== MIGRATION_TIMESTAMP)) {
    reasons.push('The migration ledger contains an unexpected timestamp outside the known migration prefix.');
  }

  if ([...timestampCounts.values()].some((count) => count !== 1)) {
    reasons.push('The migration ledger contains duplicate migration timestamps.');
  }

  const migrationRows = snapshot.ledgerRows.filter(
    (row) => timestampOf(row.created_at) === MIGRATION_TIMESTAMP,
  );
  const missingTimestamps = [...expectedTimestamps].filter(
    (timestamp) => (timestampCounts.get(timestamp) ?? 0) !== 1,
  );

  if (missingTimestamps.length > 0) {
    reasons.push('The migration ledger is missing one or more expected migrations other than 0020.');
  }

  if (migrationRows.length > 1) {
    reasons.push('The migration ledger contains duplicate records for migration 0020.');
  }

  if (migrationRows.length === 1 && migrationRows[0].hash.toLowerCase() !== expectedMigrationHash.toLowerCase()) {
    reasons.push('The existing 0020 ledger hash does not match the checked-in migration file.');
  }

  if (snapshot.extension && snapshot.extension.schemaName !== 'extensions') {
    reasons.push('pg_trgm is installed in a schema other than extensions; automatic repair is refused.');
  }

  if (snapshot.extension && snapshot.extension.version !== '1.6') {
    reasons.push('The installed pg_trgm version is not the reviewed 1.6 version.');
  }

  if (snapshot.extension && !snapshot.extensionsSchemaExists) {
    reasons.push('pg_trgm is present but its extensions schema is missing.');
  }

  const indexByName = new Map<string, IndexState[]>();
  for (const index of snapshot.indexes) {
    const list = indexByName.get(index.index_name) ?? [];
    list.push(index);
    indexByName.set(index.index_name, list);
  }

  const indexesToCreate: Array<keyof typeof EXPECTED_INDEXES> = [];
  for (const name of Object.keys(EXPECTED_INDEXES) as Array<keyof typeof EXPECTED_INDEXES>) {
    const matches = indexByName.get(name) ?? [];
    if (matches.length > 1) {
      reasons.push('More than one relation uses expected index name ' + name + '.');
    } else if (matches.length === 0) {
      indexesToCreate.push(name);
    } else if (!isCorrectIndex(matches[0], name)) {
      reasons.push('Existing index ' + name + ' does not match the reviewed GIN index definition.');
    }
  }

  if (!snapshot.extension && indexesToCreate.length < 3) {
    reasons.push('One or more trigram indexes exist while pg_trgm is absent; this partial state needs manual review.');
  }

  if (migrationRows.length === 1 && indexesToCreate.length > 0) {
    reasons.push('Migration 0020 is recorded but one or more expected indexes are missing; automatic repair is refused.');
  }

  const status: RepairPlan['status'] =
    reasons.length > 0
      ? 'blocked'
      : migrationRows.length === 1
        ? 'already-complete'
        : 'ready-to-repair';

  return {
    status,
    reasons,
    expectedTimestamp: MIGRATION_TIMESTAMP,
    expectedMigrationHash,
    needsExtensionSchema: !snapshot.extensionsSchemaExists && !snapshot.extension,
    needsExtension: !snapshot.extension,
    indexesToCreate,
    needsLedgerRecord: migrationRows.length === 0,
  };
}

async function queryRows<T>(executor: QueryExecutor, query: string, parameters?: unknown[]): Promise<T[]> {
  return (await executor.unsafe(query, parameters)) as T[];
}

async function readSnapshot(executor: QueryExecutor): Promise<RepairSnapshot> {
  const identityRows = await queryRows<{ database_name: string }>(
    executor,
    'SELECT current_database() AS database_name;',
  );
  const tableRows = await queryRows<{
    ledger_table_exists: boolean;
    releases_table_exists: boolean;
    extensions_schema_exists: boolean;
  }>(
    executor,
    [
      "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ledger_table_exists,",
      "       to_regclass('public.releases') IS NOT NULL AS releases_table_exists,",
      "       EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') AS extensions_schema_exists;",
    ].join('\n'),
  );

  if (!tableRows[0]?.ledger_table_exists) {
    return {
      databaseName: identityRows[0]?.database_name ?? '',
      ledgerTableExists: false,
      releasesTableExists: Boolean(tableRows[0]?.releases_table_exists),
      extensionsSchemaExists: Boolean(tableRows[0]?.extensions_schema_exists),
      extension: null,
      ledgerRows: [],
      indexes: [],
    };
  }

  const ledgerRows = await queryRows<LedgerRow>(
    executor,
    'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id;',
  );
  const extensionRows = await queryRows<{ name: string; schema_name: string; version: string }>(
    executor,
    [
      'SELECT extension.extname AS name, namespace.nspname AS schema_name, extension.extversion AS version',
      'FROM pg_extension AS extension',
      'JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace',
      "WHERE extension.extname = 'pg_trgm';",
    ].join('\n'),
  );
  const indexes = await queryRows<IndexState>(
    executor,
    [
      'SELECT index_namespace.nspname AS index_schema,',
      '       index_class.relname AS index_name,',
      '       table_namespace.nspname AS table_schema,',
      '       table_class.relname AS table_name,',
      '       access_method.amname AS access_method,',
      '       attribute.attname AS column_name,',
      '       index_state.indnatts AS attribute_count,',
      '       index_state.indnkeyatts AS key_attribute_count,',
      '       (index_state.indpred IS NOT NULL) AS has_predicate,',
      '       index_state.indisunique AS is_unique,',
      '       index_state.indisprimary AS is_primary,',
      '       operator_class.opcname AS opclass_name,',
      '       opclass_namespace.nspname AS opclass_schema,',
      '       index_state.indisvalid AS is_valid,',
      '       index_state.indisready AS is_ready',
      'FROM pg_index AS index_state',
      'JOIN pg_class AS index_class ON index_class.oid = index_state.indexrelid',
      'JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace',
      'JOIN pg_class AS table_class ON table_class.oid = index_state.indrelid',
      'JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace',
      'JOIN pg_am AS access_method ON access_method.oid = index_class.relam',
      'LEFT JOIN pg_attribute AS attribute ON attribute.attrelid = table_class.oid AND attribute.attnum = index_state.indkey[0]',
      'JOIN pg_opclass AS operator_class ON operator_class.oid = index_state.indclass[0]',
      'JOIN pg_namespace AS opclass_namespace ON opclass_namespace.oid = operator_class.opcnamespace',
      "WHERE index_class.relname IN ('releases_artist_trgm_idx', 'releases_title_trgm_idx', 'releases_label_trgm_idx');",
    ].join('\n'),
  );

  return {
    databaseName: identityRows[0]?.database_name ?? '',
    ledgerTableExists: true,
    releasesTableExists: Boolean(tableRows[0]?.releases_table_exists),
    extensionsSchemaExists: Boolean(tableRows[0]?.extensions_schema_exists),
    extension: extensionRows[0]
      ? {
          name: extensionRows[0].name,
          schemaName: extensionRows[0].schema_name,
          version: extensionRows[0].version,
        }
      : null,
    ledgerRows,
    indexes,
  };
}

function loadJournalEntries(): JournalEntry[] {
  const journalPath = resolve(process.cwd(), 'drizzle/meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    version: string;
    dialect: string;
    entries: JournalEntry[];
  };

  if (journal.version !== '7' || journal.dialect !== 'postgresql') {
    throw new Error('The Drizzle journal version or dialect is not the expected PostgreSQL format.');
  }

  return journal.entries;
}

function loadMigrationSql(): string {
  return readFileSync(
    resolve(process.cwd(), 'drizzle', MIGRATION_TAG + '.sql'),
    'utf8',
  );
}

function createMigrationHash(migrationSql: string): string {
  return createHash('sha256').update(migrationSql, 'utf8').digest('hex');
}

function printPlan(plan: RepairPlan, snapshot: RepairSnapshot): void {
  console.log(
    JSON.stringify(
      {
        status: plan.status,
        project: STAGING_PROJECT_REF,
        databaseHost: process.env.STAGING_DB_HOST,
        database: snapshot.databaseName,
        ledgerRows: snapshot.ledgerRows.length,
        migration0020Recorded: snapshot.ledgerRows.some(
          (row) => timestampOf(row.created_at) === MIGRATION_TIMESTAMP,
        ),
        pgTrgm: snapshot.extension
          ? {
              version: snapshot.extension.version,
              schema: snapshot.extension.schemaName,
            }
          : 'missing',
        indexes: Object.keys(EXPECTED_INDEXES).map((name) => {
          const found = snapshot.indexes.find((index) => index.index_name === name);
          return {
            name,
            status: found
              ? isCorrectIndex(found, name as keyof typeof EXPECTED_INDEXES)
                ? 'valid'
                : 'mismatch'
              : 'missing',
          };
        }),
        needsExtensionSchema: plan.needsExtensionSchema,
        needsExtension: plan.needsExtension,
        indexesToCreate: plan.indexesToCreate,
        needsLedgerRecord: plan.needsLedgerRecord,
        reasons: plan.reasons,
      },
      null,
      2,
    ),
  );
}

async function requireTypedConfirmation(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Apply mode requires an interactive terminal; no database change was made.');
    return false;
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(
      'Type exactly "' + REPAIR_CONFIRMATION + '" to repair staging migration 0020: ',
    );
    return answer === REPAIR_CONFIRMATION;
  } finally {
    prompt.close();
  }
}

async function executeRepair(
  client: ReturnType<typeof postgres>,
  plan: RepairPlan,
  journalEntries: JournalEntry[],
  migrationSql: string,
): Promise<void> {
  if (plan.status !== 'ready-to-repair') {
    throw new Error('Apply mode requires a fresh ready-to-repair plan.');
  }
  const hash = createMigrationHash(migrationSql);
  const entriesPrefix = journalEntries
    .filter((entry) => entry.idx <= 25)
    .sort((a, b) => a.idx - b.idx);
  const timestamp = entriesPrefix[MIGRATION_INDEX]?.when;

  await client.begin(async (transaction) => {
    const tx = transaction as unknown as QueryExecutor;
    await tx.unsafe("SET LOCAL lock_timeout = '5000ms';");
    await tx.unsafe("SET LOCAL statement_timeout = '60000ms';");
    await tx.unsafe("SET LOCAL idle_in_transaction_session_timeout = '15000ms';");
    await tx.unsafe('SELECT pg_advisory_xact_lock(3990020);');
    await tx.unsafe('LOCK TABLE drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE;');

    const freshSnapshot = await readSnapshot(tx);
    const freshPlan = buildStagingMigration0020Plan(freshSnapshot, journalEntries, hash, migrationSql);
    if (freshPlan.status !== 'ready-to-repair') {
      throw new Error(
        'The staging migration state changed after preflight; refusing to apply. ' +
          freshPlan.reasons.join(' '),
      );
    }

    const sqlStatements = migrationSql
      .split('--> statement-breakpoint')
      .map((statement) => statement.replace(/^\s*(?:--[^\n]*\n)*/, '').trim())
      .filter(Boolean);

    if (freshPlan.needsExtensionSchema) {
      await tx.unsafe(sqlStatements[0]);
    }
    if (freshPlan.needsExtension) {
      await tx.unsafe(sqlStatements[1]);
    }

    const statementByIndexName = new Map<string, string>();
    for (const statement of sqlStatements.slice(2)) {
      const match = statement.match(/^CREATE INDEX\s+([a-z0-9_]+)\s+/i);
      if (match) {
        statementByIndexName.set(match[1], statement);
      }
    }

    for (const indexName of freshPlan.indexesToCreate) {
      const statement = statementByIndexName.get(indexName);
      if (!statement) {
        throw new Error('The checked-in migration is missing the statement for ' + indexName + '.');
      }
      await tx.unsafe(statement);
    }

    await tx.unsafe(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2);',
      [hash, timestamp],
    );

    const postSnapshot = await readSnapshot(tx);
    const postPlan = buildStagingMigration0020Plan(postSnapshot, journalEntries, hash, migrationSql);
    if (postPlan.status !== 'already-complete') {
      throw new Error(
        'Post-repair verification failed; the transaction will roll back. ' +
          postPlan.reasons.join(' '),
      );
    }
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const applyMode = args.length === 1 && args[0] === '--apply';
  if (args.length > 0 && !applyMode) {
    console.error('Usage: npm run db:repair:staging:0020 [-- --apply]');
    process.exitCode = 2;
    return;
  }

  if (applyMode && isContinuousIntegrationEnvironment(process.env)) {
    console.error('Apply mode is disabled in CI; no database connection was opened and no change was made.');
    process.exitCode = 2;
    return;
  }

  const connectionUrl = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  const targetProblems = validateStagingConnectionTarget({
    projectRef: process.env.STAGING_DB_PROJECT_REF,
    stagingHost: process.env.STAGING_DB_HOST,
    connectionUrl,
  });

  if (targetProblems.length > 0) {
    console.error('STAGING TARGET CHECK FAILED — NO DATABASE CONNECTION OPENED');
    for (const problem of targetProblems) console.error('- ' + problem);
    process.exitCode = 2;
    return;
  }

  for (const candidate of [process.env.DATABASE_DIRECT_URL, process.env.DATABASE_URL]) {
    if (candidate && candidate.includes(PRODUCTION_PROJECT_REF)) {
      console.error('A configured database URL contains the production project reference; refusing to continue.');
      process.exitCode = 2;
      return;
    }
  }

  const journalEntries = loadJournalEntries();
  const migrationSql = loadMigrationSql();
  const migrationHash = createMigrationHash(migrationSql);
  const client = postgres(connectionUrl as string, {
    ssl: 'require',
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  });

  try {
    const snapshot = await client.begin('read only', async (transaction) => {
      const tx = transaction as unknown as QueryExecutor;
      await tx.unsafe("SET LOCAL statement_timeout = '8000ms';");
      await tx.unsafe("SET LOCAL lock_timeout = '2000ms';");
      return readSnapshot(tx);
    });

    const plan = buildStagingMigration0020Plan(snapshot, journalEntries, migrationHash, migrationSql);
    printPlan(plan, snapshot);

    if (plan.status === 'blocked') {
      process.exitCode = 1;
      return;
    }

    if (plan.status === 'already-complete') {
      console.log('Migration 0020 is already fully applied and recorded; no change is needed.');
      return;
    }

    if (!applyMode) {
      console.log('AUDIT ONLY — no database change was made.');
      console.log('A separate owner approval is required before running the explicit --apply mode.');
      return;
    }

    if (!(await requireTypedConfirmation())) {
      console.error('Confirmation was missing or did not match; no database change was made.');
      process.exitCode = 2;
      return;
    }

    await executeRepair(client, plan, journalEntries, migrationSql);
    console.log('PASS: staging migration 0020 schema objects and Drizzle ledger record were repaired and verified in one transaction.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

const invokedFile = basename(process.argv[1] || '');
if (
  invokedFile === 'stagingMigration0020Repair.ts' ||
  invokedFile === 'stagingMigration0020Repair.js'
) {
  void main().catch(() => {
    console.error(
      'Staging migration 0020 repair failed. Raw database and connection details were intentionally omitted.',
    );
    process.exitCode = 1;
  });
}
