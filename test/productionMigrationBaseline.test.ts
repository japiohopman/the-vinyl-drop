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
const validRows = baseline.timestamps.map((created_at) => ({ created_at }));

describe('production migration baseline preflight', () => {
  test('pins the exact repository migration prefix through 0023', () => {
    expect(baseline.timestamps).toHaveLength(24);
    expect(baseline.latestTag).toBe('0023_block_new_google_oauth_identities');
  });

  test('accepts exactly the expected 24 production ledger timestamps', () => {
    expect(validateProductionMigrationLedger(baseline.timestamps, validRows)).toEqual([]);
  });

  test('rejects a missing production migration entry', () => {
    const problems = validateProductionMigrationLedger(baseline.timestamps, validRows.slice(0, -1));
    expect(problems.join(' ')).toContain('Expected exactly 24');
    expect(problems.join(' ')).toContain('missing');
  });

  test('rejects duplicate production migration timestamps', () => {
    const rows = [...validRows, validRows[23]];
    const problems = validateProductionMigrationLedger(baseline.timestamps, rows);
    expect(problems.join(' ')).toContain('duplicate');
    expect(problems.join(' ')).toContain('Expected exactly 24');
  });

  test('rejects unexpected production migration timestamps', () => {
    const rows = [...validRows.slice(0, 23), { created_at: '1799999999999' }];
    const problems = validateProductionMigrationLedger(baseline.timestamps, rows);
    expect(problems.join(' ')).toContain('unexpected');
    expect(problems.join(' ')).toContain('missing');
  });

  test('rejects malformed ledger timestamps without exposing database details', () => {
    const rows = [...validRows.slice(0, 23), { created_at: 'not-a-timestamp' }];
    expect(validateProductionMigrationLedger(baseline.timestamps, rows)).toEqual([
      'The production Drizzle ledger contains an invalid migration timestamp.',
    ]);
  });

  test('rejects replaced or duplicate entries in the checked-in migration journal', () => {
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
