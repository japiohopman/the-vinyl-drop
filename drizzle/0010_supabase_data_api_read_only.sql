-- Migration: 0010_supabase_data_api_read_only.sql
-- The Vinyl Drop is a server-rendered Express/EJS application. Application data
-- mutations go through server-side services and Drizzle using DATABASE_URL.
-- The Supabase Data API is not a browser write path, so keep it read-only even
-- when an authenticated JWT and otherwise valid row-level policies are present.
--
-- Retain only the SELECT grants needed for public browsing and private favorite
-- reads. RLS policies remain in place as defense in depth for the read paths and
-- for any future role/grant changes.

REVOKE ALL PRIVILEGES ON TABLE
  "activity_events",
  "comments",
  "conversations",
  "favorites",
  "listing_photos",
  "listings",
  "messages",
  "orphaned_storage_objects",
  "physical_copies",
  "profiles",
  "releases"
FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE
  "activity_events",
  "comments",
  "listing_photos",
  "listings",
  "physical_copies",
  "profiles",
  "releases"
TO anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE "favorites" TO authenticated;
