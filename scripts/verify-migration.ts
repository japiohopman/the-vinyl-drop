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
    console.log(`  Applying migration file: ${sqlFile}`);
    const sql = fs.readFileSync(path.join(drizzleDir, sqlFile), 'utf8');
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
    `✅ Fresh migration verification successful! Verified 6 tables, 2 enums, ${fkNames.length} foreign key constraints, check constraints, and ${indexNames.length} indexes applied cleanly.`
  );
}

export async function verifyMigrationUpgrade(): Promise<void> {
  console.log('🔄 Verifying migration upgrade path from legacy 0000 schema to 0001 canonical schema...');

  const pg = new PGlite();
  const drizzleDir = path.join(process.cwd(), 'drizzle');

  // 1. Apply legacy 0000 migration
  const sql0000 = fs.readFileSync(path.join(drizzleDir, '0000_grey_living_tribunal.sql'), 'utf8');
  await pg.exec(sql0000);

  // 2. Seed profile, release, and legacy listings
  const profileId = '11111111-1111-4111-8111-111111111111';
  const releaseId = '22222222-2222-4222-8222-222222222222';
  const listing1Id = '33333333-3333-4333-8333-333333333333';
  const listing2Id = '44444444-4444-4444-8444-444444444444';

  await pg.exec(`
    INSERT INTO "profiles" ("id", "username", "display_name")
    VALUES ('${profileId}', 'test_seller', 'Test Seller');

    INSERT INTO "releases" ("id", "artist", "title", "label", "release_year")
    VALUES ('${releaseId}', 'Miles Davis', 'Kind of Blue', 'Columbia', 1959);

    INSERT INTO "listings" ("id", "release_id", "seller_id", "price", "currency", "media_condition", "sleeve_condition", "trade_available", "description", "status")
    VALUES
      ('${listing1Id}', '${releaseId}', '${profileId}', 3500, 'EUR', 'VG+', 'VG', false, 'Classic jazz record', 'published'),
      ('${listing2Id}', '${releaseId}', '${profileId}', NULL, 'EUR', 'NM', 'NM', true, 'Trade offer', 'draft');
  `);

  // 3. Apply 0001 forward migration
  const sql0001 = fs.readFileSync(path.join(drizzleDir, '0001_add_physical_copies.sql'), 'utf8');
  await pg.exec(sql0001);

  // 4. Verify physical_copies table and exact 1:1 mapping
  const copiesRes = await pg.query<{
    id: string;
    release_id: string;
    owner_id: string;
    media_condition: string;
    sleeve_condition: string;
  }>(`SELECT * FROM "physical_copies" ORDER BY created_at, id;`);

  if (copiesRes.rows.length !== 2) {
    throw new Error(`Expected 2 physical copies after migration, found ${copiesRes.rows.length}`);
  }

  const l1Res = await pg.query<{
    id: string;
    physical_copy_id: string;
    seller_id: string;
    price: number | null;
    status: string;
    description: string;
  }>(`SELECT * FROM "listings" WHERE id = '${listing1Id}';`);

  const l2Res = await pg.query<{
    id: string;
    physical_copy_id: string;
    seller_id: string;
    price: number | null;
    status: string;
    description: string;
  }>(`SELECT * FROM "listings" WHERE id = '${listing2Id}';`);

  if (l1Res.rows.length !== 1 || l2Res.rows.length !== 1) {
    throw new Error('Migrated listings not found');
  }

  const l1 = l1Res.rows[0];
  const l2 = l2Res.rows[0];

  const copy1 = copiesRes.rows.find((c) => c.id === l1.physical_copy_id);
  if (!copy1 || copy1.release_id !== releaseId || copy1.owner_id !== profileId || copy1.media_condition !== 'VG+' || copy1.sleeve_condition !== 'VG') {
    throw new Error('Listing 1 physical copy details were not correctly preserved');
  }

  const copy2 = copiesRes.rows.find((c) => c.id === l2.physical_copy_id);
  if (!copy2 || copy2.release_id !== releaseId || copy2.owner_id !== profileId || copy2.media_condition !== 'NM' || copy2.sleeve_condition !== 'NM') {
    throw new Error('Listing 2 physical copy details were not correctly preserved');
  }

  if (l1.seller_id !== profileId || l1.price !== 3500 || l1.status !== 'published' || l1.description !== 'Classic jazz record') {
    throw new Error('Listing 1 listing fields were altered incorrectly during migration');
  }

  if (l2.seller_id !== profileId || l2.price !== null || l2.status !== 'draft' || l2.description !== 'Trade offer') {
    throw new Error('Listing 2 listing fields were altered incorrectly during migration');
  }

  // Verify no orphan physical copies
  const orphanRes = await pg.query(
    `SELECT pc.id FROM "physical_copies" pc LEFT JOIN "listings" l ON l.physical_copy_id = pc.id WHERE l.id IS NULL;`
  );
  if (orphanRes.rows.length > 0) {
    throw new Error(`Found ${orphanRes.rows.length} orphan physical copies`);
  }

  // Verify legacy columns dropped from listings
  const columnsRes = await pg.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'listings';`
  );
  const colNames = columnsRes.rows.map((c) => c.column_name);
  if (!colNames.includes('physical_copy_id') || colNames.includes('release_id') || colNames.includes('media_condition') || colNames.includes('sleeve_condition')) {
    throw new Error('Legacy columns were not properly removed or physical_copy_id missing');
  }

  console.log('✅ Migration upgrade verification successful! Legacy data converted cleanly without data loss.');
}

if (require.main === module) {
  Promise.all([verifyMigrations(), verifyMigrationUpgrade()])
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration verification failed:', err);
      process.exit(1);
    });
}
