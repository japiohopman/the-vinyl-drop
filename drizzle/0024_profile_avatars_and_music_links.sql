ALTER TABLE public.profiles
  ADD COLUMN avatar_storage_path text;
--> statement-breakpoint
ALTER TABLE public.profiles
  ADD COLUMN soundcloud_url text;
--> statement-breakpoint
ALTER TABLE public.profiles
  ADD COLUMN mixcloud_url text;
--> statement-breakpoint
CREATE UNIQUE INDEX profiles_avatar_storage_path_unique_idx
  ON public.profiles (avatar_storage_path)
  WHERE avatar_storage_path IS NOT NULL;

-- Storage bucket/policies are provisioned separately using
-- docs/verification/profile-avatar-storage-provisioning.md.
-- This migration changes only public.profiles and never touches storage.objects.
