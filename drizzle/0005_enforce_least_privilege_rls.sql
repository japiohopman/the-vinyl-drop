-- Migration: 0005_enforce_least_privilege_rls.sql
-- Goal: Define and enforce Row Level Security (RLS) and least-privilege privileges for Supabase Data API / PostgREST.

-- 1. Ensure auth schema and auth.uid() helper function exist for RLS policy evaluation
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Ensure standard PostgREST roles anon and authenticated exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- 3. Revoke default public schema table privileges from anon and authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- 4. Enable Row Level Security (RLS) on all 8 public tables
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "physical_copies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;

-- 5. Define Explicit Row Level Security Policies

-- Table 1: profiles
CREATE POLICY "profiles_select_public" ON "profiles"
  FOR SELECT USING (true);

CREATE POLICY "profiles_insert_owner" ON "profiles"
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_owner" ON "profiles"
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_owner" ON "profiles"
  FOR DELETE USING (auth.uid() = id);

-- Table 2: releases
CREATE POLICY "releases_select_public" ON "releases"
  FOR SELECT USING (true);

CREATE POLICY "releases_insert_authenticated" ON "releases"
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "releases_update_authenticated" ON "releases"
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Table 3: physical_copies
CREATE POLICY "physical_copies_select_policy" ON "physical_copies"
  FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."physical_copy_id" = "physical_copies"."id"
        AND "listings"."status" = 'published'
    )
  );

CREATE POLICY "physical_copies_insert_owner" ON "physical_copies"
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "physical_copies_update_owner" ON "physical_copies"
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "physical_copies_delete_owner" ON "physical_copies"
  FOR DELETE USING (auth.uid() = owner_id);

-- Table 4: listings
CREATE POLICY "listings_select_policy" ON "listings"
  FOR SELECT USING (
    status = 'published' OR seller_id = auth.uid()
  );

CREATE POLICY "listings_insert_seller" ON "listings"
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "listings_update_seller" ON "listings"
  FOR UPDATE USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "listings_delete_seller" ON "listings"
  FOR DELETE USING (auth.uid() = seller_id);

-- Table 5: listing_photos
CREATE POLICY "listing_photos_select_policy" ON "listing_photos"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND ("listings"."status" = 'published' OR "listings"."seller_id" = auth.uid())
    )
  );

CREATE POLICY "listing_photos_insert_seller" ON "listing_photos"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND "listings"."seller_id" = auth.uid()
    )
  );

CREATE POLICY "listing_photos_update_seller" ON "listing_photos"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND "listings"."seller_id" = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND "listings"."seller_id" = auth.uid()
    )
  );

CREATE POLICY "listing_photos_delete_seller" ON "listing_photos"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND "listings"."seller_id" = auth.uid()
    )
  );

-- Table 6: comments
CREATE POLICY "comments_select_policy" ON "comments"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "comments"."listing_id"
        AND ("listings"."status" = 'published' OR "listings"."seller_id" = auth.uid())
    )
  );

CREATE POLICY "comments_insert_author" ON "comments"
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "comments"."listing_id"
        AND ("listings"."status" = 'published' OR "listings"."seller_id" = auth.uid())
    )
  );

CREATE POLICY "comments_update_author" ON "comments"
  FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

CREATE POLICY "comments_delete_author" ON "comments"
  FOR DELETE USING (auth.uid() = author_id);

-- Table 7: activity_events
CREATE POLICY "activity_events_select_policy" ON "activity_events"
  FOR SELECT USING (
    event_type IN ('listing.published', 'comment.created')
    OR (event_type = 'favorite.created' AND actor_id = auth.uid())
  );

CREATE POLICY "activity_events_insert_actor" ON "activity_events"
  FOR INSERT WITH CHECK (auth.uid() = actor_id);

CREATE POLICY "activity_events_delete_actor" ON "activity_events"
  FOR DELETE USING (auth.uid() = actor_id);

-- Table 8: favorites
CREATE POLICY "favorites_select_owner" ON "favorites"
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "favorites_insert_owner" ON "favorites"
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "favorites"."listing_id"
        AND "listings"."status" = 'published'
    )
  );

CREATE POLICY "favorites_delete_owner" ON "favorites"
  FOR DELETE USING (user_id = auth.uid());

-- 6. Grant Least-Privilege Table Privileges to anon and authenticated

-- anon role grants (public reads for standard public tables, no access to private favorites)
GRANT SELECT ON "profiles" TO anon;
GRANT SELECT ON "releases" TO anon;
GRANT SELECT ON "physical_copies" TO anon;
GRANT SELECT ON "listings" TO anon;
GRANT SELECT ON "listing_photos" TO anon;
GRANT SELECT ON "comments" TO anon;
GRANT SELECT ON "activity_events" TO anon;

-- authenticated role grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "profiles" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "releases" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "physical_copies" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "listings" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "listing_photos" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "comments" TO authenticated;
GRANT SELECT, INSERT, DELETE ON "activity_events" TO authenticated;
GRANT SELECT, INSERT, DELETE ON "favorites" TO authenticated;
