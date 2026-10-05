import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

export async function verifyMigrations(): Promise<void> {
  console.log('🔄 Verifying database migrations against isolated in-memory PostgreSQL engine...');

  const pg = new PGlite();
  const drizzleDir = path.join(process.cwd(), 'drizzle');

  if (!fs.existsSync(drizzleDir)) {
    throw new Error(`Drizzle migration directory not found at ${drizzleDir}`);
  }

  const sqlFiles = fs
    .readdirSync(drizzleDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    throw new Error('No SQL migration files found in drizzle directory');
  }

  for (const sqlFile of sqlFiles) {
    const filePath = path.join(drizzleDir, sqlFile);
    console.log(`  Applying migration file: ${sqlFile}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    await pg.exec(sql);
  }

  const tablesRes = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  );
  const tableNames = tablesRes.rows.map((r) => r.table_name);

  const expectedTables = ['comments', 'listing_photos', 'listings', 'profiles', 'releases'];
  for (const expectedTable of expectedTables) {
    if (!tableNames.includes(expectedTable)) {
      throw new Error(`Missing expected table '${expectedTable}' after migration execution`);
    }
  }

  const enumsRes = await pg.query<{ typname: string }>(
    `SELECT typname FROM pg_type WHERE typcategory = 'E' ORDER BY typname;`
  );
  const enumNames = enumsRes.rows.map((r) => r.typname);

  const expectedEnums = ['condition_grade', 'listing_status'];
  for (const expectedEnum of expectedEnums) {
    if (!enumNames.includes(expectedEnum)) {
      throw new Error(`Missing expected enum '${expectedEnum}' after migration execution`);
    }
  }

  console.log('✅ Migration verification successful! All tables, enums, constraints, and indexes applied cleanly.');
}

if (require.main === module) {
  verifyMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration verification failed:', err);
      process.exit(1);
    });
}
