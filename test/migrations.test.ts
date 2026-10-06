import { execSync } from 'child_process';

describe('Database Migration Execution & Forward Upgrade Test (Isolated PostgreSQL Strategy)', () => {
  it('should apply generated SQL migration files cleanly and verify forward upgrade path on isolated PostgreSQL engine', () => {
    const output = execSync('npx tsx scripts/verify-migration.ts', {
      encoding: 'utf8',
      cwd: process.cwd(),
    });

    expect(output).toContain('Fresh migration verification successful!');
    expect(output).toContain('Migration upgrade verification successful!');
    expect(output).toContain('Applying migration file: 0000_grey_living_tribunal.sql');
    expect(output).toContain('Applying migration file: 0001_add_physical_copies.sql');
  });
});
