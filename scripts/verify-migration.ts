import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import fs from 'fs';
import path from 'path';

export async function verifyMigrations(): Promise<void> {
  console.log('🔄 Verifying database migrations via Drizzle migrator against isolated in-memory PostgreSQL engine...');

  const pg = new PGlite();

  // Bootstrap auth and storage schemas, auth.uid(), auth.role(), and storage.foldername() stubs for local/PGlite migration verification
  await pg.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOLOGIN;
      END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    BEGIN
      RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
    BEGIN
      RETURN COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
    END;
    $$ LANGUAGE plpgsql STABLE;

    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      bucket_id text NOT NULL,
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb
    );

    CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $$
    BEGIN
      RETURN string_to_array(name, '/');
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  const drizzleDir = path.join(process.cwd(), 'drizzle');

  if (!fs.existsSync(drizzleDir)) {
    throw new Error(`Drizzle migration directory not found at ${drizzleDir}`);
  }

  // 0. Verify Drizzle journal consistency
  const journalPath = path.join(drizzleDir, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Drizzle journal file missing at ${journalPath}`);
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const journalTags = journal.entries.map((e: { tag: string }) => `${e.tag}.sql`);

  const sqlFiles = fs
    .readdirSync(drizzleDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    throw new Error('No SQL migration files found in drizzle directory');
  }

  for (const sqlFile of sqlFiles) {
    if (!journalTags.includes(sqlFile)) {
      throw new Error(`SQL migration file '${sqlFile}' is not registered in drizzle/meta/_journal.json`);
    }
    console.log(`  Applying migration file: ${sqlFile}`);
  }

  // Run migrations using Drizzle's official migrator
  const db = drizzle(pg);
  await migrate(db, { migrationsFolder: drizzleDir });

  // Verify migration history table recorded all migration entries
  const migrationHistory = await pg.query<{ id: number; hash: string; created_at: number }>(
    `SELECT * FROM drizzle.__drizzle_migrations ORDER BY id;`
  );
  if (migrationHistory.rows.length !== journal.entries.length) {
    throw new Error(
      `Drizzle migration history recorded ${migrationHistory.rows.length} entries, expected ${journal.entries.length}`
    );
  }

  const consentTable = await pg.query<{ relrowsecurity: boolean }>(
    "SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'registration_consents' AND c.relkind = 'r';"
  );
  if (consentTable.rows.length !== 1 || !consentTable.rows[0].relrowsecurity) {
    throw new Error('Private registration-consent table is missing or RLS is disabled');
  }
  const consentColumns = await pg.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'private' AND table_name = 'registration_consents' ORDER BY ordinal_position;"
  );
  if (consentColumns.rows.map((row) => row.column_name).join(',') !== 'user_id,terms_version,terms_accepted_at,age_attested_at') {
    throw new Error('Registration-consent audit stores more than the approved minimum fields');
  }
  for (const role of ['anon', 'authenticated', 'supabase_auth_admin']) {
    const access = await pg.query<{ schema_usage: boolean; can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>(
      'SELECT has_schema_privilege($1, \'private\', \'USAGE\') AS schema_usage, has_table_privilege($1, \'private.registration_consents\', \'SELECT\') AS can_select, has_table_privilege($1, \'private.registration_consents\', \'INSERT\') AS can_insert, has_table_privilege($1, \'private.registration_consents\', \'UPDATE\') AS can_update, has_table_privilege($1, \'private.registration_consents\', \'DELETE\') AS can_delete;',
      [role]
    );
    const privileges = access.rows[0];
    if (privileges.schema_usage || privileges.can_select || privileges.can_insert || privileges.can_update || privileges.can_delete) {
      throw new Error('Registration-consent audit is accessible to restricted role ' + role);
    }
  }
  const consentUserId = 'e1111111-1111-4111-8111-111111111111';
  await pg.query('INSERT INTO auth.users (id) VALUES ($1::uuid);', [consentUserId]);
  await pg.query(
    "INSERT INTO private.registration_consents (user_id, terms_version, terms_accepted_at, age_attested_at) VALUES ($1::uuid, 'beta-terms-test-v1', now(), now());",
    [consentUserId]
  );
  await pg.query('DELETE FROM auth.users WHERE id = $1::uuid;', [consentUserId]);
  const consentRows = await pg.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM private.registration_consents WHERE user_id = $1::uuid;',
    [consentUserId]
  );
  if (consentRows.rows[0].count !== 0) throw new Error('Registration-consent audit did not cascade on Auth identity deletion');

  // 1. Verify expected public tables (all 11 public tables including conversations and messages)
  const tablesRes = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  );
  const tableNames = tablesRes.rows.map((r) => r.table_name);
  const expectedTables = [
    'activity_events',
    'comments',
    'conversations',
    'favorites',
    'listing_photos',
    'listings',
    'messages',
    'orphaned_storage_objects',
    'physical_copies',
    'profiles',
    'releases',
  ];
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
    'activity_events_actor_id_profiles_id_fk',
    'activity_events_listing_id_listings_id_fk',
    'activity_events_comment_id_comments_id_fk',
    'favorites_user_id_profiles_id_fk',
    'favorites_listing_id_listings_id_fk',
    'conversations_listing_id_fkey',
    'conversations_buyer_id_fkey',
    'messages_conversation_id_fkey',
    'messages_sender_id_fkey',
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
  if (!checkNames.includes('messages_body_length_check')) {
    throw new Error("Missing expected check constraint 'messages_body_length_check' after migration execution");
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
    'profiles_username_lower_idx',
    'releases_artist_idx',
    'releases_title_idx',
    'releases_label_idx',
    'releases_cat_num_idx',
    'releases_year_idx',
    'activity_events_actor_idx',
    'activity_events_listing_idx',
    'activity_events_type_idx',
    'activity_events_created_at_idx',
    'favorites_user_listing_idx',
    'favorites_user_idx',
    'favorites_listing_idx',
    'conversations_listing_buyer_idx',
    'conversations_listing_idx',
    'conversations_buyer_idx',
    'conversations_updated_at_idx',
    'messages_conversation_created_id_idx',
    'messages_sender_idx',
  ];
  for (const expectedIndex of expectedIndexes) {
    if (!indexNames.includes(expectedIndex)) {
      throw new Error(`Missing expected index '${expectedIndex}' after migration execution`);
    }
  }

  // 6. Verify triggers
  const triggerRes = await pg.query<{ tgname: string }>(
    `SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_check_conversation_validity', 'trg_check_message_sender_validity');`
  );
  const triggerNames = triggerRes.rows.map((r) => r.tgname);
  for (const expectedTrigger of ['trg_check_conversation_validity', 'trg_check_message_sender_validity']) {
    if (!triggerNames.includes(expectedTrigger)) {
      throw new Error(`Missing expected database trigger '${expectedTrigger}' after migration execution`);
    }
  }

  // 6a. Verify messaging trigger functions pin search_path and qualify every lookup.
  const messagingFunctionsRes = await pg.query<{
    proname: string;
    empty_search_path: boolean;
    function_body: string;
  }>(
    `SELECT p.proname,
            COALESCE(p.proconfig @> ARRAY['search_path=""'], false) AS empty_search_path,
            p.prosrc AS function_body
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('check_conversation_validity', 'check_message_sender_validity')
     ORDER BY p.proname;`
  );
  if (messagingFunctionsRes.rows.length !== 2) {
    throw new Error(`Expected both public messaging trigger functions, found ${messagingFunctionsRes.rows.length}`);
  }
  for (const fn of messagingFunctionsRes.rows) {
    if (!fn.empty_search_path) {
      throw new Error(`Messaging trigger function '${fn.proname}' must pin search_path to the empty path`);
    }
    const qualifiedReferences = fn.proname === 'check_conversation_validity'
      ? ['public.listings', 'public.listing_status']
      : ['public.conversations', 'public.listings'];
    for (const reference of qualifiedReferences) {
      if (!fn.function_body.includes(reference)) {
        throw new Error(`Messaging trigger function '${fn.proname}' does not schema-qualify '${reference}'`);
      }
    }
  }

  // 6b. Exercise the existing trigger behavior against isolated migration fixtures.
  // The fixture rows are written by the isolated verifier's database owner, not a live role.
  const messagingFixture = {
    sellerId: 'd1111111-1111-4111-8111-111111111111',
    buyerId: 'd2222222-2222-4222-8222-222222222222',
    outsiderId: 'd3333333-3333-4333-8333-333333333333',
    releaseId: 'd4444444-4444-4444-8444-444444444444',
    publishedCopyId: 'd5555555-5555-4555-8555-555555555555',
    draftCopyId: 'd6666666-6666-4666-8666-666666666666',
    publishedListingId: 'd7777777-7777-4777-8777-777777777777',
    draftListingId: 'd8888888-8888-4888-8888-888888888888',
    conversationId: 'd9999999-9999-4999-8999-999999999999',
  };
  await pg.query(
    `INSERT INTO public.profiles (id, username, display_name)
     VALUES ($1::uuid, 'trigger_seller', 'Trigger Seller'),
            ($2::uuid, 'trigger_buyer', 'Trigger Buyer'),
            ($3::uuid, 'trigger_outsider', 'Trigger Outsider');`,
    [messagingFixture.sellerId, messagingFixture.buyerId, messagingFixture.outsiderId]
  );
  await pg.query(
    `INSERT INTO public.releases (id, artist, title, label, release_year)
     VALUES ($1::uuid, 'Trigger Test', 'Search Path LP', 'Test Label', 2001);`,
    [messagingFixture.releaseId]
  );
  await pg.query(
    `INSERT INTO public.physical_copies (id, release_id, owner_id, media_condition, sleeve_condition)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'NM', 'NM'),
            ($4::uuid, $2::uuid, $3::uuid, 'VG+', 'VG+');`,
    [messagingFixture.publishedCopyId, messagingFixture.releaseId, messagingFixture.sellerId,
     messagingFixture.draftCopyId]
  );
  await pg.query(
    `INSERT INTO public.listings (id, physical_copy_id, seller_id, price, currency, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 2500, 'EUR', 'published'),
            ($4::uuid, $5::uuid, $3::uuid, 2000, 'EUR', 'draft');`,
    [messagingFixture.publishedListingId, messagingFixture.publishedCopyId, messagingFixture.sellerId,
     messagingFixture.draftListingId, messagingFixture.draftCopyId]
  );

  const expectTriggerRejection = async (
    label: string,
    query: string,
    params: unknown[],
    expectedMessage: string
  ): Promise<void> => {
    try {
      await pg.query(query, params);
    } catch (error) {
      if (!String(error).includes(expectedMessage)) {
        throw new Error(`${label} failed for an unexpected reason: ${String(error)}`);
      }
      return;
    }
    throw new Error(`${label} unexpectedly succeeded`);
  };

  await pg.query(
    `INSERT INTO public.conversations (id, listing_id, buyer_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid);`,
    [messagingFixture.conversationId, messagingFixture.publishedListingId, messagingFixture.buyerId]
  );
  await expectTriggerRejection(
    'Seller opening a conversation on their own listing',
    `INSERT INTO public.conversations (id, listing_id, buyer_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid);`,
    ['da111111-1111-4111-8111-111111111111', messagingFixture.publishedListingId, messagingFixture.sellerId],
    'cannot start a conversation on their own listing'
  );
  await expectTriggerRejection(
    'Conversation on a draft listing',
    `INSERT INTO public.conversations (id, listing_id, buyer_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid);`,
    ['da222222-2222-4222-8222-222222222222', messagingFixture.draftListingId, messagingFixture.buyerId],
    'Conversations can only be started on published listings'
  );
  await expectTriggerRejection(
    'Conversation for a nonexistent listing',
    `INSERT INTO public.conversations (id, listing_id, buyer_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid);`,
    ['da333333-3333-4333-8333-333333333333', 'da444444-4444-4444-8444-444444444444', messagingFixture.buyerId],
    'does not exist'
  );

  await pg.query(
    `INSERT INTO public.messages (id, conversation_id, sender_id, body)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'valid buyer message'),
            ($4::uuid, $2::uuid, $5::uuid, 'valid seller message');`,
    ['db111111-1111-4111-8111-111111111111', messagingFixture.conversationId, messagingFixture.buyerId,
     'db222222-2222-4222-8222-222222222222', messagingFixture.sellerId]
  );
  await expectTriggerRejection(
    'Message from a non-participant',
    `INSERT INTO public.messages (id, conversation_id, sender_id, body)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'unauthorized message');`,
    ['db333333-3333-4333-8333-333333333333', messagingFixture.conversationId, messagingFixture.outsiderId],
    'neither buyer nor seller'
  );
  const conversationCount = await pg.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM public.conversations WHERE id = $1::uuid;`,
    [messagingFixture.conversationId]
  );
  const messageCount = await pg.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM public.messages WHERE conversation_id = $1::uuid;`,
    [messagingFixture.conversationId]
  );
  if (conversationCount.rows[0].count !== 1 || messageCount.rows[0].count !== 2) {
    throw new Error('Messaging trigger regression checks left unexpected conversation/message rows');
  }

  // 7. Verify Row Level Security (RLS) is enabled on all 11 public tables
  const rlsRes = await pg.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT c.relname, c.relrowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname;`
  );
  const rlsMap = new Map(rlsRes.rows.map((r) => [r.relname, r.relrowsecurity]));
  for (const expectedTable of expectedTables) {
    if (!rlsMap.has(expectedTable)) {
      throw new Error(`Missing expected table '${expectedTable}' in RLS check`);
    }
    if (!rlsMap.get(expectedTable)) {
      throw new Error(`Row Level Security (RLS) is NOT enabled on table '${expectedTable}'`);
    }
  }

  // 8. Verify Storage RLS enabled and policy details applied on storage.objects (from migration 0006)
  const storageRlsRes = await pg.query<{ relrowsecurity: boolean }>(
    `SELECT c.relrowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage' AND c.relname = 'objects';`
  );

  if (storageRlsRes.rows.length === 0 || !storageRlsRes.rows[0].relrowsecurity) {
    throw new Error("Row Level Security (RLS) is NOT enabled on 'storage.objects'");
  }

  const storagePoliciesRes = await pg.query<{
    policyname: string;
    cmd: string;
    qual: string | null;
    with_check: string | null;
  }>(
    `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname;`
  );

  const expectedStoragePolicyMap: Record<
    string,
    { cmd: string; qualContains?: string; checkContains?: string }
  > = {
    'Authenticated Seller Delete for listing-photos': {
      cmd: 'DELETE',
      qualContains: "bucket_id = 'listing-photos'",
    },
    'Authenticated Seller Insert for listing-photos': {
      cmd: 'INSERT',
      checkContains: "bucket_id = 'listing-photos'",
    },
    'Authenticated Seller Update for listing-photos': {
      cmd: 'UPDATE',
      qualContains: "bucket_id = 'listing-photos'",
      checkContains: "bucket_id = 'listing-photos'",
    },
    'Scoped Read Access for listing-photos': {
      cmd: 'SELECT',
      qualContains: "bucket_id = 'listing-photos'",
    },
  };

  const foundPolicies = new Map(storagePoliciesRes.rows.map((p) => [p.policyname, p]));

  // Assert exact policy count to guarantee no extra/unrecognized permissive write policies exist
  if (storagePoliciesRes.rows.length !== Object.keys(expectedStoragePolicyMap).length) {
    throw new Error(
      `Unexpected policy count on storage.objects: expected ${Object.keys(expectedStoragePolicyMap).length}, found ${storagePoliciesRes.rows.length}`
    );
  }

  const expectedPredicates: Record<
    string,
    { qualIncludes?: string[]; checkIncludes?: string[] }
  > = {
    'Authenticated Seller Delete for listing-photos': {
      qualIncludes: [
        "bucket_id = 'listing-photos'",
        "auth.role() = 'authenticated'",
        "seller_id = auth.uid()",
        "id)::text = (storage.foldername(objects.name))[2]",
      ],
    },
    'Authenticated Seller Insert for listing-photos': {
      checkIncludes: [
        "bucket_id = 'listing-photos'",
        "auth.role() = 'authenticated'",
        "seller_id = auth.uid()",
        "id)::text = (storage.foldername(objects.name))[2]",
      ],
    },
    'Authenticated Seller Update for listing-photos': {
      qualIncludes: [
        "bucket_id = 'listing-photos'",
        "auth.role() = 'authenticated'",
        "seller_id = auth.uid()",
        "id)::text = (storage.foldername(objects.name))[2]",
      ],
      checkIncludes: [
        "bucket_id = 'listing-photos'",
        "auth.role() = 'authenticated'",
        "seller_id = auth.uid()",
        "id)::text = (storage.foldername(objects.name))[2]",
      ],
    },
    'Scoped Read Access for listing-photos': {
      qualIncludes: [
        "bucket_id = 'listing-photos'",
        "status = 'published'",
        "seller_id = auth.uid()",
        "id)::text = (storage.foldername(objects.name))[2]",
      ],
    },
  };

  for (const [policyName, spec] of Object.entries(expectedStoragePolicyMap)) {
    const policy = foundPolicies.get(policyName);
    if (!policy) {
      throw new Error(`Missing expected Storage RLS policy '${policyName}' on storage.objects`);
    }

    if (policy.cmd.toUpperCase() !== spec.cmd) {
      throw new Error(
        `Storage policy '${policyName}' command mismatch: expected '${spec.cmd}', got '${policy.cmd}'`
      );
    }

    const predicates = expectedPredicates[policyName];
    if (predicates.qualIncludes) {
      for (const requiredStr of predicates.qualIncludes) {
        if (!policy.qual || !policy.qual.includes(requiredStr)) {
          throw new Error(
            `Storage policy '${policyName}' USING predicate missing required clause '${requiredStr}'`
          );
        }
      }
    }

    if (predicates.checkIncludes) {
      for (const requiredStr of predicates.checkIncludes) {
        if (!policy.with_check || !policy.with_check.includes(requiredStr)) {
          throw new Error(
            `Storage policy '${policyName}' WITH CHECK predicate missing required clause '${requiredStr}'`
          );
        }
      }
    }
  }

  // 9. Verify that Supabase Data API roles are read-only on every application table.
  // The Express/Drizzle server is the sole application data-write path.
  for (const table of expectedTables) {
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
        const result = await pg.query<{ has_privilege: boolean }>(
          `SELECT has_table_privilege('${role}', '${table}', '${privilege}') AS has_privilege;`
        );

        if (result.rows[0].has_privilege) {
          throw new Error(
            `Table '${table}' must not grant ${privilege} to Supabase Data API role '${role}'`
          );
        }
      }
    }
  }

  const publicReadTables = [
    'activity_events',
    'comments',
    'listing_photos',
    'listings',
    'physical_copies',
    'profiles',
    'releases',
  ];
  for (const table of publicReadTables) {
    for (const role of ['anon', 'authenticated']) {
      const result = await pg.query<{ has_privilege: boolean }>(
        `SELECT has_table_privilege('${role}', '${table}', 'SELECT') AS has_privilege;`
      );
      if (!result.rows[0].has_privilege) {
        throw new Error(`Expected SELECT access for '${role}' on public-read table '${table}'`);
      }
    }
  }

  const authenticatedFavorites = await pg.query<{ has_privilege: boolean }>(
    `SELECT has_table_privilege('authenticated', 'favorites', 'SELECT') AS has_privilege;`
  );
  const anonymousFavorites = await pg.query<{ has_privilege: boolean }>(
    `SELECT has_table_privilege('anon', 'favorites', 'SELECT') AS has_privilege;`
  );
  if (!authenticatedFavorites.rows[0].has_privilege || anonymousFavorites.rows[0].has_privilege) {
    throw new Error('Expected authenticated-only SELECT access to favorites');
  }

  for (const privateTable of ['orphaned_storage_objects', 'conversations', 'messages']) {
    for (const role of ['anon', 'authenticated']) {
      const result = await pg.query<{ has_privilege: boolean }>(
        `SELECT has_table_privilege('${role}', '${privateTable}', 'SELECT') AS has_privilege;`
      );
      if (result.rows[0].has_privilege) {
        throw new Error(
          `Private table '${privateTable}' must not grant SELECT to Supabase Data API role '${role}'`
        );
      }
    }
  }

  // 9. Verify the private one-time approval contract for Supabase Auth's Before User Created hook.
  const approvalFunctionRes = await pg.query<{ security_definer: boolean; empty_search_path: boolean }>(
    "SELECT p.prosecdef AS security_definer, COALESCE(p.proconfig @> ARRAY['search_path=\"\"'], false) AS empty_search_path FROM pg_proc p WHERE p.oid = to_regprocedure('private.enforce_password_checked_signup(jsonb)');"
  );
  if (
    approvalFunctionRes.rows.length !== 1 ||
    approvalFunctionRes.rows[0].security_definer ||
    !approvalFunctionRes.rows[0].empty_search_path
  ) {
    throw new Error('Signup hook must use SECURITY INVOKER and pin search_path to the empty path');
  }

  const authHookPrivilegeRes = await pg.query<{
    schema_usage: boolean;
    can_execute: boolean;
    can_select: boolean;
    can_update_consumed: boolean;
    can_update_created_at: boolean;
    can_insert: boolean;
    can_delete: boolean;
  }>(
    "SELECT has_schema_privilege('supabase_auth_admin', 'private', 'USAGE') AS schema_usage, has_function_privilege('supabase_auth_admin', 'private.enforce_password_checked_signup(jsonb)', 'EXECUTE') AS can_execute, has_table_privilege('supabase_auth_admin', 'private.password_checked_signup_approvals', 'SELECT') AS can_select, has_column_privilege('supabase_auth_admin', 'private.password_checked_signup_approvals', 'consumed_at', 'UPDATE') AS can_update_consumed, has_column_privilege('supabase_auth_admin', 'private.password_checked_signup_approvals', 'created_at', 'UPDATE') AS can_update_created_at, has_table_privilege('supabase_auth_admin', 'private.password_checked_signup_approvals', 'INSERT') AS can_insert, has_table_privilege('supabase_auth_admin', 'private.password_checked_signup_approvals', 'DELETE') AS can_delete;"
  );
  const hookPrivileges = authHookPrivilegeRes.rows[0];
  if (
    !hookPrivileges?.schema_usage || !hookPrivileges.can_execute || !hookPrivileges.can_select ||
    !hookPrivileges.can_update_consumed || hookPrivileges.can_update_created_at ||
    hookPrivileges.can_insert || hookPrivileges.can_delete
  ) {
    throw new Error('Supabase Auth admin has incorrect privileges for the private signup approval hook');
  }

  const deniedPrivateAccessRes = await pg.query<{ role_name: string; schema_usage: boolean; can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>(
    "SELECT role_name, has_schema_privilege(role_name, 'private', 'USAGE') AS schema_usage, has_table_privilege(role_name, 'private.password_checked_signup_approvals', 'SELECT') AS can_select, has_table_privilege(role_name, 'private.password_checked_signup_approvals', 'INSERT') AS can_insert, has_table_privilege(role_name, 'private.password_checked_signup_approvals', 'UPDATE') AS can_update, has_table_privilege(role_name, 'private.password_checked_signup_approvals', 'DELETE') AS can_delete FROM unnest(ARRAY['anon', 'authenticated']) AS roles(role_name);"
  );
  if (deniedPrivateAccessRes.rows.length !== 2 || deniedPrivateAccessRes.rows.some((row) => row.schema_usage || row.can_select || row.can_insert || row.can_update || row.can_delete)) {
    throw new Error('The private signup-approval schema/table is accessible to anon or authenticated roles');
  }

  const runSignupHook = async (event: Record<string, unknown>): Promise<Record<string, unknown>> => {
    await pg.exec('SET ROLE supabase_auth_admin;');
    try {
      const response = await pg.query<{ decision: unknown }>(
        "SELECT private.enforce_password_checked_signup($1::jsonb) AS decision;",
        [JSON.stringify(event)]
      );
      const decision = response.rows[0]?.decision;
      return (typeof decision === 'string' ? JSON.parse(decision) : decision) as Record<string, unknown>;
    } finally {
      await pg.exec('RESET ROLE;');
    }
  };
  const emailSignupEvent = (email: string, approvalId?: string): Record<string, unknown> => ({
    user: { email, app_metadata: { provider: 'email' }, user_metadata: approvalId ? { signup_approval_id: approvalId } : {} },
  });

  const validApprovalId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await pg.query("INSERT INTO private.password_checked_signup_approvals (approval_id, email_normalized, expires_at) VALUES ($1::uuid, $2, now() + INTERVAL '5 minutes');", [validApprovalId, 'checked@example.com']);
  const allowedEmailSignup = await runSignupHook(emailSignupEvent('CHECKED@example.com', validApprovalId));
  if (allowedEmailSignup.error) throw new Error('A valid, unexpired, matching one-time signup approval was rejected');
  const replayedApproval = await runSignupHook(emailSignupEvent('checked@example.com', validApprovalId));
  if (!replayedApproval.error) throw new Error('A consumed signup approval was replayed successfully');
  const directEmailSignup = await runSignupHook(emailSignupEvent('direct@example.com'));
  if (!directEmailSignup.error) throw new Error('Direct email signup without an app-issued approval was not rejected');

  const wrongEmailApprovalId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await pg.query("INSERT INTO private.password_checked_signup_approvals (approval_id, email_normalized, expires_at) VALUES ($1::uuid, $2, now() + INTERVAL '5 minutes');", [wrongEmailApprovalId, 'approved@example.com']);
  const wrongEmail = await runSignupHook(emailSignupEvent('other@example.com', wrongEmailApprovalId));
  if (!wrongEmail.error) throw new Error('Signup approval was accepted for a different email address');

  const expiredApprovalId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await pg.query("INSERT INTO private.password_checked_signup_approvals (approval_id, email_normalized, created_at, expires_at) VALUES ($1::uuid, $2, now() - INTERVAL '10 minutes', now() - INTERVAL '5 minutes');", [expiredApprovalId, 'expired@example.com']);
  const expiredApproval = await runSignupHook(emailSignupEvent('expired@example.com', expiredApprovalId));
  if (!expiredApproval.error) throw new Error('An expired signup approval was accepted');

  const allowedGoogleOAuth = await runSignupHook({ user: { email: 'oauth@example.com', app_metadata: { provider: 'google' }, user_metadata: {} } });
  if (allowedGoogleOAuth.error) throw new Error('Google OAuth signup without a password was incorrectly blocked by the password hook');
  const unknownProvider = await runSignupHook({ user: { email: 'unknown@example.com', app_metadata: { provider: 'other-provider' }, user_metadata: {} } });
  if (!unknownProvider.error) throw new Error('An unapproved Auth provider bypassed the signup hook');

  console.log(
    `✅ Fresh migration verification successful! Verified ${migrationHistory.rows.length} migrations, RLS on ${expectedTables.length} application tables, ${storagePoliciesRes.rows.length} Storage RLS policies, no client Data API INSERT/UPDATE/DELETE grants, expected read-only SELECT grants, 2 enums, ${fkNames.length} foreign key constraints, check constraints, 2 validation triggers, one-time Auth signup approval contract, search_path-pinned messaging trigger functions with valid/invalid conversation and message checks, and ${indexNames.length} indexes applied cleanly via Drizzle migrator.`
  );
}

export async function verifyMigrationUpgrade(): Promise<void> {
  console.log('🔄 Verifying migration upgrade path from legacy 0000 schema to 0001 canonical schema...');

  const pg = new PGlite();

  // Bootstrap auth schema and auth.uid() stub
  await pg.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOLOGIN;
      END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    BEGIN
      RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

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
