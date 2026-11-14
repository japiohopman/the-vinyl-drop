import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertApprovedMigration0026Sql,
  getExpectedProductionMigration0026Entries,
  getProductionMigration0026SchemaProblems,
  normalizePostgresExpression,
  validateProductionMigration0026Ledger,
  type Migration0026SchemaSnapshot,
} from '../scripts/verifyProductionMigration0026';

const journal = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
) as unknown;
const expected = getExpectedProductionMigration0026Entries(journal);
const baselineRows = expected.slice(0, 26).map((migration) => ({
  created_at: migration.timestamp,
  hash: migration.acceptedHashes[0],
}));
const completeRows = expected.map((migration) => ({
  created_at: migration.timestamp,
  hash: migration.acceptedHashes[0],
}));

const baselineSchema: Migration0026SchemaSnapshot = {
  enums: [],
  columns: [
    { table_name: 'profiles', column_name: 'avatar_storage_path', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null },
    { table_name: 'profiles', column_name: 'soundcloud_url', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null },
    { table_name: 'profiles', column_name: 'mixcloud_url', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null },
    { table_name: 'releases', column_name: 'styles', data_type: 'ARRAY', udt_name: '_text', is_nullable: 'NO', column_default: null },
    { table_name: 'releases', column_name: 'canonical_styles', data_type: 'ARRAY', udt_name: '_text', is_nullable: 'NO', column_default: null },
  ],
  indexes: ['profiles_avatar_storage_path_unique_idx', 'releases_canonical_styles_idx'],
  constraint: null,
};

const appliedSchema: Migration0026SchemaSnapshot = {
  enums: [
    { name: 'release_content_type', labels: ['music', 'non_music'] },
    {
      name: 'special_pressing_characteristic',
      labels: [
        'picture_disc', 'solid_colour', 'translucent', 'multi_colour', 'splatter',
        'marble', 'glitter', 'glow_in_the_dark', 'metallic', 'shaped',
      ],
    },
  ],
  columns: [
    ...baselineSchema.columns,
    { table_name: 'releases', column_name: 'content_type', data_type: 'USER-DEFINED', udt_name: 'release_content_type', is_nullable: 'NO', column_default: "'music'::release_content_type" },
    { table_name: 'physical_copies', column_name: 'special_pressing', data_type: 'boolean', udt_name: 'bool', is_nullable: 'NO', column_default: 'false' },
    { table_name: 'physical_copies', column_name: 'special_pressing_characteristics', data_type: 'ARRAY', udt_name: '_special_pressing_characteristic', is_nullable: 'NO', column_default: "'{}'::special_pressing_characteristic[]" },
    { table_name: 'physical_copies', column_name: 'special_pressing_details', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null },
  ],
  indexes: baselineSchema.indexes,
  constraint: {
    convalidated: true,
    definition: 'CHECK ((((special_pressing = false) AND (cardinality(special_pressing_characteristics) = 0) AND (special_pressing_details IS NULL)) OR ((special_pressing = true) AND (cardinality(special_pressing_characteristics) > 0))))',
  },
};

describe('pinned production migration 0026 preflight', () => {
  test('pins the actual migration 0026 SQL to the independent approved SHA-256', () => {
    const sql = readFileSync(resolve(process.cwd(), 'drizzle/0026_release_content_type_and_special_pressing.sql'), 'utf8');
    expect(() => assertApprovedMigration0026Sql(sql)).not.toThrow();
    expect(() => assertApprovedMigration0026Sql(sql + '\n-- unapproved change')).toThrow('independently pinned approved SHA-256');
    expect(normalizePostgresExpression("'{}'::special_pressing_characteristic[]"))
      .toBe(normalizePostgresExpression("  '{}' :: SPECIAL_PRESSING_CHARACTERISTIC [ ] "));
  });

  test('pins exactly the repository migration prefix through 0026 and reads its SQL hash', () => {
    expect(expected).toHaveLength(27);
    expect(expected[25].tag).toBe('0025_add_release_styles');
    expect(expected[26].idx).toBe(26);
    expect(expected[26].tag).toBe('0026_release_content_type_and_special_pressing');
    expect(expected[26].acceptedHashes).toContain(
      '225a33bb06f21519a3a73c32a6765b4ed0da1dda5632df3c49e8894a44f6633b',
    );
  });

  test('accepts the exact ordered 0000-0025 baseline before migration', () => {
    expect(validateProductionMigration0026Ledger(expected, baselineRows, 'preflight')).toEqual([]);
  });

  test('accepts the exact ordered 0000-0026 ledger after migration', () => {
    expect(validateProductionMigration0026Ledger(expected, completeRows, 'complete')).toEqual([]);
  });

  test('rejects an already-recorded 0026 entry during preflight', () => {
    const problems = validateProductionMigration0026Ledger(expected, completeRows, 'preflight');
    expect(problems.join(' ')).toContain('Expected exactly 26');
  });

  test('rejects missing, duplicate, unexpected and reordered ledger rows', () => {
    expect(validateProductionMigration0026Ledger(expected, baselineRows.slice(0, -1), 'preflight').join(' ')).toContain('Expected exactly 26');

    const duplicate = [...baselineRows.slice(0, 25), baselineRows[24], baselineRows[25]];
    expect(validateProductionMigration0026Ledger(expected, duplicate, 'preflight').join(' ')).toContain('timestamp/order');

    const reordered = [...baselineRows];
    [reordered[2], reordered[3]] = [reordered[3], reordered[2]];
    expect(validateProductionMigration0026Ledger(expected, reordered, 'preflight').join(' ')).toContain('timestamp/order');

    const withExtra = [...completeRows, completeRows[26]];
    expect(validateProductionMigration0026Ledger(expected, withExtra, 'complete').join(' ')).toContain('Expected exactly 27');
  });

  test('rejects altered or malformed SHA-256 ledger hashes', () => {
    const tampered = completeRows.map((row, index) => ({
      ...row,
      hash: index === 26 ? '0'.repeat(64) : row.hash,
    }));
    expect(validateProductionMigration0026Ledger(expected, tampered, 'complete').join(' ')).toContain('hash does not match');

    const malformed = completeRows.map((row, index) => ({
      ...row,
      hash: index === 26 ? 'not-a-hash' : row.hash,
    }));
    expect(validateProductionMigration0026Ledger(expected, malformed, 'complete').join(' ')).toContain('invalid SHA-256');
  });

  test('rejects a replaced, missing, duplicate or later repository journal entry', () => {
    const source = journal as { version: string; dialect: string; entries: Array<{ idx: number; tag: string; when: number }> };

    const replaced = {
      ...source,
      entries: source.entries.map((entry) => entry.idx === 26 ? { ...entry, tag: '0026_unapproved' } : entry),
    };
    expect(() => getExpectedProductionMigration0026Entries(replaced)).toThrow('pinned migration tag');

    const missing = { ...source, entries: source.entries.filter((entry) => entry.idx !== 26) };
    expect(() => getExpectedProductionMigration0026Entries(missing)).toThrow('pinned 0000-0026 prefix');

    const duplicate = { ...source, entries: [...source.entries, { ...source.entries[26] }] };
    expect(() => getExpectedProductionMigration0026Entries(duplicate)).toThrow('pinned 0000-0026 prefix');

    const later = {
      ...source,
      entries: [...source.entries, { idx: 27, version: '7', when: 1795000000000, tag: '0027_future', breakpoints: true }],
    };
    expect(() => getExpectedProductionMigration0026Entries(later)).toThrow('pinned 0000-0026 prefix');

    const reorderedEntries = [...source.entries];
    [reorderedEntries[4], reorderedEntries[5]] = [reorderedEntries[5], reorderedEntries[4]];
    expect(() => getExpectedProductionMigration0026Entries({ ...source, entries: reorderedEntries }))
      .toThrow('exact ascending index order');
  });

  test('requires a clean 0026 absence before migration', () => {
    expect(getProductionMigration0026SchemaProblems(baselineSchema, 'preflight')).toEqual([]);

    const contaminated: Migration0026SchemaSnapshot = {
      ...baselineSchema,
      enums: [{ name: 'release_content_type', labels: ['music', 'non_music'] }],
    };
    expect(getProductionMigration0026SchemaProblems(contaminated, 'preflight').join(' ')).toContain('already exists');
  });

  test('requires exact 0026 enums, defaults, columns and validated CHECK after migration', () => {
    expect(getProductionMigration0026SchemaProblems(appliedSchema, 'complete', true)).toEqual([]);

    const unvalidated = {
      ...appliedSchema,
      constraint: { ...appliedSchema.constraint!, convalidated: false },
    };
    expect(getProductionMigration0026SchemaProblems(unvalidated, 'complete', true).join(' ')).toContain('not validated');

    const wrongShape = {
      ...appliedSchema,
      enums: [{ name: 'release_content_type', labels: ['music', 'non_music'] }],
    };
    expect(getProductionMigration0026SchemaProblems(wrongShape, 'complete', true).join(' ')).toContain('special_pressing_characteristic');

    const wrongConstraint = {
      ...appliedSchema,
      constraint: {
        convalidated: true,
        definition: appliedSchema.constraint!.definition.replace(/\)$/, ') OR true)'),
      },
    };
    expect(getProductionMigration0026SchemaProblems(wrongConstraint, 'complete', true).join(' '))
      .toContain('does not match the exact approved constraint definition');

    const wrongDefault = {
      ...appliedSchema,
      columns: appliedSchema.columns.map((column) =>
        column.table_name === 'physical_copies' &&
        column.column_name === 'special_pressing_characteristics'
          ? { ...column, column_default: "'{picture_disc}'::special_pressing_characteristic[]" }
          : column,
      ),
    };
    expect(getProductionMigration0026SchemaProblems(wrongDefault, 'complete', true).join(' '))
      .toContain('special_pressing_characteristics does not match its approved type/default/nullability');
  });
});
