-- Version-controlled migration for Supabase Storage objects RLS policies
-- Bucket: listing-photos

DO $$
DECLARE
  v_storage_owner name;
  v_total_policy_count integer;
  v_matching_policy_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    SELECT pg_get_userbyid(c.relowner)::name
    INTO v_storage_owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects';

    IF v_storage_owner IS DISTINCT FROM current_user THEN
      -- Supabase may own storage.objects under a managed role that the app's
      -- PostgreSQL connection cannot assume. In that case, do not attempt DDL
      -- on the managed table. Accept the migration only if the four exact
      -- least-privilege policies have already been provisioned via Supabase.
      SELECT count(*)
      INTO v_total_policy_count
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects';

      SELECT count(*)
      INTO v_matching_policy_count
      FROM pg_policies p
      WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
        AND (
          (p.policyname = 'Scoped Read Access for listing-photos'
            AND p.cmd = 'SELECT'
            AND p.roles = ARRAY['public']::name[]
            AND p.qual LIKE '%bucket_id = ''listing-photos''%'
            AND p.qual LIKE '%storage.foldername(objects.name))[2]%'
            AND p.qual LIKE '%status = ''published''%'
            AND p.qual LIKE '%seller_id = auth.uid()%'
            AND p.with_check IS NULL)
          OR
          (p.policyname = 'Authenticated Seller Insert for listing-photos'
            AND p.cmd = 'INSERT'
            AND p.roles = ARRAY['authenticated']::name[]
            AND p.qual IS NULL
            AND p.with_check LIKE '%bucket_id = ''listing-photos''%'
            AND p.with_check LIKE '%auth.role() = ''authenticated''%'
            AND p.with_check LIKE '%storage.foldername(objects.name))[2]%'
            AND p.with_check LIKE '%seller_id = auth.uid()%')
          OR
          (p.policyname = 'Authenticated Seller Update for listing-photos'
            AND p.cmd = 'UPDATE'
            AND p.roles = ARRAY['authenticated']::name[]
            AND p.qual LIKE '%bucket_id = ''listing-photos''%'
            AND p.qual LIKE '%auth.role() = ''authenticated''%'
            AND p.qual LIKE '%storage.foldername(objects.name))[2]%'
            AND p.qual LIKE '%seller_id = auth.uid()%'
            AND p.with_check LIKE '%bucket_id = ''listing-photos''%'
            AND p.with_check LIKE '%auth.role() = ''authenticated''%'
            AND p.with_check LIKE '%storage.foldername(objects.name))[2]%'
            AND p.with_check LIKE '%seller_id = auth.uid()%')
          OR
          (p.policyname = 'Authenticated Seller Delete for listing-photos'
            AND p.cmd = 'DELETE'
            AND p.roles = ARRAY['authenticated']::name[]
            AND p.qual LIKE '%bucket_id = ''listing-photos''%'
            AND p.qual LIKE '%auth.role() = ''authenticated''%'
            AND p.qual LIKE '%storage.foldername(objects.name))[2]%'
            AND p.qual LIKE '%seller_id = auth.uid()%'
            AND p.with_check IS NULL)
        );

      IF v_total_policy_count = 4 AND v_matching_policy_count = 4 THEN
        RAISE NOTICE 'Storage policy migration verified the four pre-provisioned listing-photos policies; skipping managed storage.objects DDL because current role % is not the table owner %.', current_user, v_storage_owner;
      ELSE
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format('Cannot safely apply listing-photos policies: current role %I does not own storage.objects (owner: %I), and the exact four expected policies are not present.', current_user, v_storage_owner),
          HINT = 'Provision the four listing-photos policies using the Supabase Dashboard as an authorized owner, then rerun npm run db:migrate.';
      END IF;
    ELSE
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    -- Drop legacy or existing policies for idempotent migration
    DROP POLICY IF EXISTS "Public Read Access for listing-photos" ON storage.objects;
    DROP POLICY IF EXISTS "Scoped Read Access for listing-photos" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated Seller Insert for listing-photos" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated Seller Update for listing-photos" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated Seller Delete for listing-photos" ON storage.objects;

    -- 1. Scoped Read Access (Published listings or Seller Owned)
    CREATE POLICY "Scoped Read Access for listing-photos"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'listing-photos'
      AND (
        EXISTS (
          SELECT 1 FROM public.listings
          WHERE id::text = (storage.foldername(name))[2]
            AND (status = 'published' OR seller_id = auth.uid())
        )
      )
    );

    -- 2. Authenticated Seller Insert Policy
    CREATE POLICY "Authenticated Seller Insert for listing-photos"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'listing-photos'
      AND auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.listings
        WHERE id::text = (storage.foldername(name))[2]
          AND seller_id = auth.uid()
      )
    );

    -- 3. Authenticated Seller Update Policy
    CREATE POLICY "Authenticated Seller Update for listing-photos"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'listing-photos'
      AND auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.listings
        WHERE id::text = (storage.foldername(name))[2]
          AND seller_id = auth.uid()
      )
    )
    WITH CHECK (
      bucket_id = 'listing-photos'
      AND auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.listings
        WHERE id::text = (storage.foldername(name))[2]
          AND seller_id = auth.uid()
      )
    );

    -- 4. Authenticated Seller Delete Policy
    CREATE POLICY "Authenticated Seller Delete for listing-photos"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'listing-photos'
      AND auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.listings
        WHERE id::text = (storage.foldername(name))[2]
          AND seller_id = auth.uid()
      )
    );
    END IF;
  END IF;
END $$;
