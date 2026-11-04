-- #333: Keep a private, lossless editing source separate from public display artwork.
-- Existing rows remain source-less until the seller first opens them in the editor.
ALTER TABLE public.listing_photos
  ADD COLUMN source_storage_path text;
--> statement-breakpoint
ALTER TABLE public.listing_photos
  ADD COLUMN source_is_legacy boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE public.listing_photos
  ADD COLUMN editor_state jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX listing_photos_source_storage_path_unique_idx
  ON public.listing_photos (source_storage_path)
  WHERE source_storage_path IS NOT NULL;
--> statement-breakpoint
-- The source bucket itself must be created as a PRIVATE bucket in Supabase Storage.
-- Do not write to storage.buckets: it is managed metadata. If the migration role
-- does not own storage.objects, create these three exact policies in Studio first.
DO $$
DECLARE
  v_owner name;
  v_rls_enabled boolean;
  v_policy_count integer;
  v_matching_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) OR NOT EXISTS (
      SELECT 1
      FROM storage.buckets
      WHERE id = 'listing-photo-originals' AND public IS FALSE
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'The listing-photo-originals Storage bucket must exist and be private before migration 0022 can complete.',
        HINT = 'Create listing-photo-originals with public = false in Supabase Storage, then rerun migrations.';
    END IF;

    SELECT pg_get_userbyid(c.relowner)::name, c.relrowsecurity
      INTO v_owner, v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects';

    IF v_owner = current_user THEN
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "listing-photo-originals-select-owner" ON storage.objects;
      DROP POLICY IF EXISTS "listing-photo-originals-insert-owner" ON storage.objects;
      DROP POLICY IF EXISTS "listing-photo-originals-delete-owner" ON storage.objects;

      CREATE POLICY "listing-photo-originals-select-owner"
        ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id = 'listing-photo-originals'
          AND EXISTS (
            SELECT 1 FROM public.listings
            WHERE id::text = (storage.foldername(name))[2]
              AND seller_id = (select auth.uid())
          )
        );

      CREATE POLICY "listing-photo-originals-insert-owner"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'listing-photo-originals'
          AND EXISTS (
            SELECT 1 FROM public.listings
            WHERE id::text = (storage.foldername(name))[2]
              AND seller_id = (select auth.uid())
          )
        );

      CREATE POLICY "listing-photo-originals-delete-owner"
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id = 'listing-photo-originals'
          AND EXISTS (
            SELECT 1 FROM public.listings
            WHERE id::text = (storage.foldername(name))[2]
              AND seller_id = (select auth.uid())
          )
        );
    ELSE
      SELECT count(*) INTO v_policy_count
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN (
          'listing-photo-originals-select-owner',
          'listing-photo-originals-insert-owner',
          'listing-photo-originals-delete-owner'
        );

      SELECT count(*) INTO v_matching_count
      FROM pg_policies p
      WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
        AND (
          (p.policyname = 'listing-photo-originals-select-owner'
            AND p.cmd = 'SELECT'
            AND p.roles = ARRAY['authenticated']::name[]
            AND position('bucket_id = ''listing-photo-originals''' in p.qual) > 0
            AND position('seller_id = ( SELECT auth.uid()' in p.qual) > 0
            AND position('storage.foldername(objects.name))[2]' in p.qual) > 0
            AND p.with_check IS NULL)
          OR
          (p.policyname = 'listing-photo-originals-insert-owner'
            AND p.cmd = 'INSERT'
            AND p.roles = ARRAY['authenticated']::name[]
            AND p.qual IS NULL
            AND position('bucket_id = ''listing-photo-originals''' in p.with_check) > 0
            AND position('seller_id = ( SELECT auth.uid()' in p.with_check) > 0
            AND position('storage.foldername(objects.name))[2]' in p.with_check) > 0)
          OR
          (p.policyname = 'listing-photo-originals-delete-owner'
            AND p.cmd = 'DELETE'
            AND p.roles = ARRAY['authenticated']::name[]
            AND position('bucket_id = ''listing-photo-originals''' in p.qual) > 0
            AND position('seller_id = ( SELECT auth.uid()' in p.qual) > 0
            AND position('storage.foldername(objects.name))[2]' in p.qual) > 0
            AND p.with_check IS NULL)
        );

      IF v_rls_enabled IS DISTINCT FROM true OR v_policy_count <> 3 OR v_matching_count <> 3 THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            'Cannot safely provision private listing photo source access: current role %I does not own storage.objects (owner: %I), and the exact three owner-scoped policies are not present.',
            current_user, v_owner
          ),
          HINT = 'Create the private listing-photo-originals bucket and the three exact SELECT/INSERT/DELETE policies in Supabase Studio, then rerun migrations.';
      END IF;
    END IF;
  END IF;
END $$;
