-- Issue #351 — dedicated profile avatar Storage policies.
-- Create/configure the public "profile-avatars" bucket in Supabase Studio first.
-- The bucket's public setting supplies public reads. Upload and delete stay scoped
-- to authenticated objects under profiles/<auth-user-uuid>/....

CREATE POLICY "profile-avatars-owner-insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
  );

CREATE POLICY "profile-avatars-owner-delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
  );
