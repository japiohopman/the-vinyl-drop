import { execSync } from 'child_process';

describe('Database Migration Execution (Isolated PostgreSQL Strategy)', () => {
  it('should apply generated SQL migration file cleanly on an isolated PostgreSQL engine without secrets', () => {
    const output = execSync('npx tsx scripts/verify-migration.ts', {
      encoding: 'utf8',
      cwd: process.cwd(),
    });

    expect(output).toContain('Migration verification successful!');
    expect(output).toContain('Applying migration file:');
  });
});
