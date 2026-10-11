-- Version-controlled migration for Supabase Storage objects RLS policies
-- Bucket: listing-photos

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE table_schema = 'storage' AND table_name = 'objects') THEN
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
END $$;
