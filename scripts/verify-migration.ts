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

  // 1. Verify expected public tables
  const tablesRes = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  );
  const tableNames = tablesRes.rows.map((r) => r.table_name);
  const expectedTables = ['comments', 'listing_photos', 'listings', 'physical_copies', 'profiles', 'releases'];
  for (const expectedTable of expectedTables) {
    if (!tableNames.includes(expectedTable)) {
      throw new Error(`Missing expected table '${expectedTable}' after migration execution`);
    }
  }

  // 2. Verify expected custom enum types
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

  // 3. Verify expected foreign key constraints
  const fkRes = await pg.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE contype = 'f' ORDER BY conname;`
  );
  const fkNames = fkRes.rows.map((r) => r.conname);
  const expectedFks = [
    'comments_listing_id_listings_id_fk',
    'comments_author_id_profiles_id_fk',
    'listing_photos_listing_id_listings_id_fk',
    'physical_copies_release_id_releases_id_fk',
    'physical_copies_owner_id_profiles_id_fk',
    'listings_physical_copy_id_physical_copies_id_fk',
    'listings_seller_id_profiles_id_fk',
  ];
  for (const expectedFk of expectedFks) {
    if (!fkNames.includes(expectedFk)) {
      throw new Error(`Missing expected foreign key constraint '${expectedFk}' after migration execution`);
    }
  }

  // 4. Verify check constraints
  const checkRes = await pg.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE contype = 'c' ORDER BY conname;`
  );
  const checkNames = checkRes.rows.map((r) => r.conname);
  if (!checkNames.includes('listings_price_check')) {
    throw new Error("Missing expected check constraint 'listings_price_check' after migration execution");
  }

  // 5. Verify expected database indexes
  const indexRes = await pg.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;`
  );
  const indexNames = indexRes.rows.map((r) => r.indexname);
  const expectedIndexes = [
    'comments_listing_idx',
    'comments_author_idx',
    'comments_created_at_idx',
    'listing_photos_listing_idx',
    'listing_photos_order_idx',
    'physical_copies_release_idx',
    'physical_copies_owner_idx',
    'listings_seller_idx',
    'listings_physical_copy_idx',
    'listings_status_idx',
    'listings_price_idx',
    'listings_created_at_idx',
    'listings_active_physical_copy_idx',
    'releases_artist_idx',
    'releases_title_idx',
    'releases_label_idx',
    'releases_cat_num_idx',
    'releases_year_idx',
  ];
  for (const expectedIndex of expectedIndexes) {
    if (!indexNames.includes(expectedIndex)) {
      throw new Error(`Missing expected index '${expectedIndex}' after migration execution`);
    }
  }

  console.log(
    `✅ Migration verification successful! Verified 6 tables, 2 enums, ${fkNames.length} foreign key constraints, check constraints, and ${indexNames.length} indexes applied cleanly.`
  );
}

if (require.main === module) {
  verifyMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration verification failed:', err);
      process.exit(1);
    });
}
