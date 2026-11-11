import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildStagingMigration0020Plan,
  createStagingTlsOptions,
  isContinuousIntegrationEnvironment,
  EXPECTED_INDEXES,
  MIGRATION_TIMESTAMP,
  STAGING_POOLER_HOST,
  STAGING_PROJECT_REF,
  validateStagingConnectionTarget,
  type IndexState,
  type JournalEntry,
  type RepairSnapshot,
} from '../scripts/stagingMigration0020Repair';

const EXPECTED_HASH = 'a'.repeat(64);
const CHECKED_IN_MIGRATION_SQL = readFileSync(
  resolve(process.cwd(), 'drizzle/0020_catalogue_search_trigram.sql'),
  'utf8',
);

function makeJournal(): JournalEntry[] {
  return Array.from({ length: 26 }, (_, idx) => ({
    idx,
    tag: idx === 20 ? '0020_catalogue_search_trigram' : 'migration_' + idx,
    when: MIGRATION_TIMESTAMP + (idx - 20) * 10000,
  }));
}

function makeIndex(name: keyof typeof EXPECTED_INDEXES): IndexState {
  return {
    index_schema: 'public',
    index_name: name,
    table_schema: 'public',
    table_name: 'releases',
    access_method: 'gin',
    column_name: EXPECTED_INDEXES[name].column,
    collation_matches: true,
    attribute_count: 1,
    key_attribute_count: 1,
    has_predicate: false,
    is_unique: false,
    is_primary: false,
    opclass_name: 'gin_trgm_ops',
    opclass_schema: 'extensions',
    is_valid: true,
    is_ready: true,
  };
}

function makeSnapshot(overrides: Partial<RepairSnapshot> = {}): RepairSnapshot {
  const journal = makeJournal();
  return {
    databaseName: 'postgres',
    ledgerTableExists: true,
    releasesTableExists: true,
    extensionsSchemaExists: false,
    extension: null,
    ledgerRows: journal
      .filter((entry) => entry.idx !== 20)
      .map((entry, index) => ({
        id: index < 13 ? index + 1 : index + 2,
        hash: 'b'.repeat(64),
        created_at: entry.when,
      })),
    indexes: [],
    ...overrides,
  };
}

describe('staging migration 0020 repair planner', () => {
  it('accepts the checked-in migration SQL during preflight', () => {
    const plan = buildStagingMigration0020Plan(
      makeSnapshot(),
      makeJournal(),
      EXPECTED_HASH,
      CHECKED_IN_MIGRATION_SQL,
    );

    expect(plan.status).toBe('ready-to-repair');
    expect(plan.reasons).toEqual([]);
  });

  it('blocks migration SQL when a reviewed statement has been changed', () => {
    const alteredSql = CHECKED_IN_MIGRATION_SQL.replace(
      'ON public.releases USING GIN (title extensions.gin_trgm_ops);',
      'ON public.releases USING GIN (title gin_trgm_ops);',
    );
    const plan = buildStagingMigration0020Plan(
      makeSnapshot(),
      makeJournal(),
      EXPECTED_HASH,
      alteredSql,
    );

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('does not match the reviewed schema/index statements');
  });

  it('blocks reordered journal entries instead of sorting them back into place', () => {
    const reorderedJournal = makeJournal();
    [reorderedJournal[20], reorderedJournal[21]] = [reorderedJournal[21], reorderedJournal[20]];

    const plan = buildStagingMigration0020Plan(
      makeSnapshot(),
      reorderedJournal,
      EXPECTED_HASH,
      CHECKED_IN_MIGRATION_SQL,
    );

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('missing, duplicate or reordered entry');
  });

  it('blocks an otherwise matching index when its collation differs from the table column', () => {
    const badIndex = { ...makeIndex('releases_artist_trgm_idx'), collation_matches: false };
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: [badIndex],
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('does not match the reviewed GIN index definition');
  });

  it('plans the missing extension, all three indexes, and one ledger row', () => {
    const plan = buildStagingMigration0020Plan(makeSnapshot(), makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('ready-to-repair');
    expect(plan.needsExtensionSchema).toBe(true);
    expect(plan.needsExtension).toBe(true);
    expect(plan.indexesToCreate).toEqual(Object.keys(EXPECTED_INDEXES));
    expect(plan.needsLedgerRecord).toBe(true);
    expect(plan.reasons).toEqual([]);
  });

  it('plans a ledger-only repair when the extension and all indexes are already correct', () => {
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: Object.keys(EXPECTED_INDEXES).map((name) =>
        makeIndex(name as keyof typeof EXPECTED_INDEXES),
      ),
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('ready-to-repair');
    expect(plan.needsExtensionSchema).toBe(false);
    expect(plan.needsExtension).toBe(false);
    expect(plan.indexesToCreate).toEqual([]);
    expect(plan.needsLedgerRecord).toBe(true);
  });

  it('creates only indexes missing from a partially provisioned but otherwise correct state', () => {
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: [makeIndex('releases_artist_trgm_idx'), makeIndex('releases_label_trgm_idx')],
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('ready-to-repair');
    expect(plan.indexesToCreate).toEqual(['releases_title_trgm_idx']);
  });

  it('accepts a fully repaired database without scheduling another write', () => {
    const journal = makeJournal();
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: Object.keys(EXPECTED_INDEXES).map((name) =>
        makeIndex(name as keyof typeof EXPECTED_INDEXES),
      ),
      ledgerRows: [
        ...makeSnapshot().ledgerRows,
        { id: 27, hash: EXPECTED_HASH, created_at: MIGRATION_TIMESTAMP },
      ],
    });
    const plan = buildStagingMigration0020Plan(snapshot, journal, EXPECTED_HASH);

    expect(plan.status).toBe('already-complete');
    expect(plan.needsLedgerRecord).toBe(false);
    expect(plan.indexesToCreate).toEqual([]);
  });

  it('blocks an existing index with a mismatched operator class', () => {
    const badIndex = { ...makeIndex('releases_artist_trgm_idx'), opclass_name: 'text_ops' };
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: [badIndex],
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('does not match the reviewed GIN index definition');
  });

  it('blocks a trigram index with extra columns, a partial predicate, or uniqueness', () => {
    const base = makeIndex('releases_artist_trgm_idx');
    const snapshots = [
      { ...base, attribute_count: 2 },
      { ...base, key_attribute_count: 2 },
      { ...base, has_predicate: true },
      { ...base, is_unique: true },
      { ...base, is_valid: false },
      { ...base, is_ready: false },
    ];

    for (const index of snapshots) {
      const plan = buildStagingMigration0020Plan(
        makeSnapshot({
          extensionsSchemaExists: true,
          extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
          indexes: [index],
        }),
        makeJournal(),
        EXPECTED_HASH,
      );
      expect(plan.status).toBe('blocked');
    }
  });

  it('blocks pg_trgm when it is installed outside the extensions schema', () => {
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'public', version: '1.6' },
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('other than extensions');
  });

  it('blocks if a prior or later migration timestamp is missing', () => {
    const snapshot = makeSnapshot({
      ledgerRows: makeSnapshot().ledgerRows.filter(
        (row) => row.created_at !== makeJournal()[7].when,
      ),
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('missing one or more expected migrations other than 0020');
  });

  it('blocks duplicate timestamps, unknown timestamps and duplicate 0020 rows', () => {
    const originalRows = makeSnapshot().ledgerRows;
    const duplicatePrior = makeSnapshot({
      ledgerRows: [...originalRows, { ...originalRows[0], id: 999 }],
    });
    const unknownTimestamp = makeSnapshot({
      ledgerRows: [...originalRows, { id: 999, hash: 'c'.repeat(64), created_at: 1234567890 }],
    });
    const duplicate0020 = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: Object.keys(EXPECTED_INDEXES).map((name) =>
        makeIndex(name as keyof typeof EXPECTED_INDEXES),
      ),
      ledgerRows: [
        ...originalRows,
        { id: 27, hash: EXPECTED_HASH, created_at: MIGRATION_TIMESTAMP },
        { id: 28, hash: EXPECTED_HASH, created_at: MIGRATION_TIMESTAMP },
      ],
    });

    expect(buildStagingMigration0020Plan(duplicatePrior, makeJournal(), EXPECTED_HASH).status).toBe('blocked');
    expect(buildStagingMigration0020Plan(unknownTimestamp, makeJournal(), EXPECTED_HASH).status).toBe('blocked');
    expect(buildStagingMigration0020Plan(duplicate0020, makeJournal(), EXPECTED_HASH).status).toBe('blocked');
  });

  it('blocks a 0020 ledger row with a hash that differs from the checked-in migration', () => {
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: Object.keys(EXPECTED_INDEXES).map((name) =>
        makeIndex(name as keyof typeof EXPECTED_INDEXES),
      ),
      ledgerRows: [
        ...makeSnapshot().ledgerRows,
        { id: 27, hash: 'd'.repeat(64), created_at: MIGRATION_TIMESTAMP },
      ],
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('0020 ledger hash');
  });

  it('blocks a recorded migration if any expected index is missing', () => {
    const snapshot = makeSnapshot({
      extensionsSchemaExists: true,
      extension: { name: 'pg_trgm', schemaName: 'extensions', version: '1.6' },
      indexes: [makeIndex('releases_artist_trgm_idx'), makeIndex('releases_label_trgm_idx')],
      ledgerRows: [
        ...makeSnapshot().ledgerRows,
        { id: 27, hash: EXPECTED_HASH, created_at: MIGRATION_TIMESTAMP },
      ],
    });
    const plan = buildStagingMigration0020Plan(snapshot, makeJournal(), EXPECTED_HASH);

    expect(plan.status).toBe('blocked');
    expect(plan.reasons.join(' ')).toContain('recorded but one or more expected indexes are missing');
  });
});

describe('staging migration 0020 apply execution boundary', () => {
  it('requires a PEM CA and enables certificate and hostname verification', () => {
    const caCertificate =
      '-----BEGIN CERTIFICATE-----\\nMIIBtest\\n-----END CERTIFICATE-----';
    const options = createStagingTlsOptions(caCertificate);

    expect(options).toEqual({ ca: caCertificate, rejectUnauthorized: true });
    expect(() => createStagingTlsOptions('not-a-certificate')).toThrow(
      'must contain a PEM certificate',
    );
  });

  it('recognizes GitHub Actions and generic CI environments', () => {
    expect(isContinuousIntegrationEnvironment({ CI: 'true' })).toBe(true);
    expect(isContinuousIntegrationEnvironment({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(isContinuousIntegrationEnvironment({ CI: 'TRUE' })).toBe(true);
    expect(isContinuousIntegrationEnvironment({ CI: '1' })).toBe(true);
    expect(isContinuousIntegrationEnvironment({ GITHUB_RUN_ID: '12345' })).toBe(true);
    expect(isContinuousIntegrationEnvironment({ GITLAB_CI: 'true' })).toBe(true);
  });

  it('allows local interactive environments without CI markers', () => {
    expect(isContinuousIntegrationEnvironment({})).toBe(false);
    expect(isContinuousIntegrationEnvironment({ CI: 'false', GITHUB_ACTIONS: 'false' })).toBe(false);
  });
});

describe('staging migration 0020 target validation', () => {
  const poolerUrl =
    'postgresql://postgres.' +
    STAGING_PROJECT_REF +
    ':test-password@' +
    STAGING_POOLER_HOST +
    ':5432/postgres?sslmode=require';

  it('accepts only the known staging project and approved session-pooler identity', () => {
    expect(
      validateStagingConnectionTarget({
        projectRef: STAGING_PROJECT_REF,
        stagingHost: STAGING_POOLER_HOST,
        connectionUrl: poolerUrl,
      }),
    ).toEqual([]);
  });

  it('accepts the exact staging direct database host with forced TLS', () => {
    const directHost = 'db.' + STAGING_PROJECT_REF + '.supabase.co';
    const directUrl =
      'postgresql://postgres:test-password@' + directHost + ':5432/postgres';
    expect(
      validateStagingConnectionTarget({
        projectRef: STAGING_PROJECT_REF,
        stagingHost: directHost,
        connectionUrl: directUrl,
      }),
    ).toEqual([]);
  });

  it('rejects the production project and production database host', () => {
    const problems = validateStagingConnectionTarget({
      projectRef: 'anxhmlalxjvatrufcjei',
      stagingHost: 'aws-0-eu-west-1.pooler.supabase.com',
      connectionUrl:
        'postgresql://postgres.anxhmlalxjvatrufcjei:test-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
    });
    expect(problems.length).toBeGreaterThan(0);
  });

  it('rejects a lookalike project, unapproved host, unexpected port and non-required TLS mode', () => {
    const wrongHost = 'aws-0-eu-west-1.pooler.supabase.com.attacker.example';
    const cases = [
      {
        projectRef: STAGING_PROJECT_REF,
        stagingHost: STAGING_POOLER_HOST,
        connectionUrl:
          'postgresql://postgres.' + STAGING_PROJECT_REF + ':pw@' + wrongHost + ':5432/postgres?sslmode=require',
      },
      {
        projectRef: STAGING_PROJECT_REF,
        stagingHost: STAGING_POOLER_HOST,
        connectionUrl:
          'postgresql://postgres.' + STAGING_PROJECT_REF + ':pw@' + STAGING_POOLER_HOST + ':6543/postgres?sslmode=require',
      },
      {
        projectRef: STAGING_PROJECT_REF,
        stagingHost: STAGING_POOLER_HOST,
        connectionUrl:
          'postgresql://postgres.' + STAGING_PROJECT_REF + ':pw@' + STAGING_POOLER_HOST + ':5432/postgres?sslmode=prefer',
      },
    ];

    for (const input of cases) {
      expect(validateStagingConnectionTarget(input).length).toBeGreaterThan(0);
    }
  });

  it('rejects additional URL parameters and mismatched configured hosts', () => {
    const extraParameter =
      'postgresql://postgres.' +
      STAGING_PROJECT_REF +
      ':pw@' +
      STAGING_POOLER_HOST +
      ':5432/postgres?sslmode=require&options=unsafe';
    expect(
      validateStagingConnectionTarget({
        projectRef: STAGING_PROJECT_REF,
        stagingHost: STAGING_POOLER_HOST,
        connectionUrl: extraParameter,
      }).length,
    ).toBeGreaterThan(0);

    expect(
      validateStagingConnectionTarget({
        projectRef: STAGING_PROJECT_REF,
        stagingHost: 'wrong-host.example',
        connectionUrl: poolerUrl,
      }).length,
    ).toBeGreaterThan(0);
  });
});
