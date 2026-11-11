import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getExpectedProductionMigrationBaseline,
  validateProductionMigrationLedger,
} from '../scripts/verifyProductionMigrationBaseline';

const readJournal = (): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8')) as unknown;

const journal = readJournal();
const baseline = getExpectedProductionMigrationBaseline(journal);
const validRows = baseline.migrations.map((migration) => ({
  created_at: migration.timestamp,
  hash: migration.acceptedHashes[0],
}));

describe('production migration baseline preflight', () => {
  test('pins the exact repository migration prefix and SQL hashes through 0023', () => {
    expect(baseline.migrations).toHaveLength(24);
    expect(baseline.latestTag).toBe('0023_block_new_google_oauth_identities');
    expect(baseline.migrations.every((migration) => migration.acceptedHashes.length >= 1)).toBe(true);
  });

  test('accepts the exact 24-entry production baseline with approved migration hashes', () => {
    expect(validateProductionMigrationLedger(baseline.migrations, validRows)).toEqual([]);
  });

  test('accepts Drizzle hashes produced from either LF or CRLF checked-out SQL files', () => {
    const crlfRows = baseline.migrations.map((migration) => ({
      created_at: migration.timestamp,
      hash: migration.acceptedHashes[migration.acceptedHashes.length - 1],
    }));
    expect(validateProductionMigrationLedger(baseline.migrations, crlfRows)).toEqual([]);
  });

  test('rejects an altered historical SQL hash even when every timestamp is correct', () => {
    const tamperedRows = validRows.map((row, index) => ({
      ...row,
      hash: index === 23 ? '0'.repeat(64) : row.hash,
    }));
    const problems = validateProductionMigrationLedger(baseline.migrations, tamperedRows);
    expect(problems.join(' ')).toContain('index 23');
    expect(problems.join(' ')).toContain('hash does not match');
  });

  test('rejects a missing production migration entry', () => {
    const problems = validateProductionMigrationLedger(baseline.migrations, validRows.slice(0, -1));
    expect(problems.join(' ')).toContain('Expected exactly 24');
    expect(problems.join(' ')).toContain('missing');
  });

  test('rejects duplicate production migration timestamps', () => {
    const rows = [...validRows, validRows[23]];
    const problems = validateProductionMigrationLedger(baseline.migrations, rows);
    expect(problems.join(' ')).toContain('duplicate');
    expect(problems.join(' ')).toContain('Expected exactly 24');
  });

  test('rejects unexpected production migration timestamps', () => {
    const rows = [...validRows.slice(0, 23), {
      ...validRows[23],
      created_at: '1799999999999',
    }];
    const problems = validateProductionMigrationLedger(baseline.migrations, rows);
    expect(problems.join(' ')).toContain('unexpected');
    expect(problems.join(' ')).toContain('missing');
  });

  test('rejects malformed ledger timestamps and malformed hashes', () => {
    const invalidTimestampRows = [...validRows.slice(0, 23), {
      ...validRows[23],
      created_at: 'not-a-timestamp',
    }];
    expect(validateProductionMigrationLedger(baseline.migrations, invalidTimestampRows)).toContain(
      'The production Drizzle ledger contains an invalid migration timestamp.',
    );

    const invalidHashRows = [...validRows.slice(0, 23), {
      ...validRows[23],
      hash: 'not-a-sha256-hash',
    }];
    expect(validateProductionMigrationLedger(baseline.migrations, invalidHashRows).join(' ')).toContain(
      'invalid SHA-256 ledger hash',
    );
  });

  test('rejects replaced, missing or duplicate entries in the checked-in migration journal', () => {
    const parsed = readJournal() as {
      entries: Array<{ idx: number; tag: string; when: number }>;
    };

    const replaced = {
      ...parsed,
      entries: parsed.entries.map((entry) =>
        entry.idx === 23 ? { ...entry, tag: 'unexpected_migration_0023' } : entry,
      ),
    };
    expect(() => getExpectedProductionMigrationBaseline(replaced)).toThrow(
      'does not match the pinned migration tag',
    );

    const missing = {
      ...parsed,
      entries: parsed.entries.filter((entry) => entry.idx !== 23),
    };
    expect(() => getExpectedProductionMigrationBaseline(missing)).toThrow(
      'must occur exactly once',
    );

    const duplicate = {
      ...parsed,
      entries: [...parsed.entries, { ...parsed.entries.find((entry) => entry.idx === 23)! }],
    };
    expect(() => getExpectedProductionMigrationBaseline(duplicate)).toThrow(
      'must occur exactly once',
    );
  });

  test('ignores source journal entries after 0023 when checking the production baseline', () => {
    const parsed = readJournal() as {
      version: string;
      dialect: string;
      entries: Array<{ idx: number; tag: string; when: number }>;
    };
    const journalWithFutureEntries = {
      ...parsed,
      entries: [
        ...parsed.entries,
        {
          idx: 26,
          tag: '0026_future_feature',
          when: 1794300000000,
        },
      ],
    };

    expect(getExpectedProductionMigrationBaseline(journalWithFutureEntries)).toEqual(baseline);
  });
});
