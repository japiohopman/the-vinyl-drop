-- Migration: 0005_enforce_least_privilege_rls.sql
-- Goal: Define and enforce Row Level Security (RLS) and least-privilege privileges for Supabase Data API / PostgREST.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "releases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "physical_copies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "listing_photos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "profiles_select_public" ON "profiles"
  FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "profiles_insert_owner" ON "profiles"
  FOR INSERT WITH CHECK (auth.uid() = id);
--> statement-breakpoint
CREATE POLICY "profiles_update_owner" ON "profiles"
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
--> statement-breakpoint
CREATE POLICY "profiles_delete_owner" ON "profiles"
  FOR DELETE USING (auth.uid() = id);
--> statement-breakpoint
CREATE POLICY "releases_select_public" ON "releases"
  FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "physical_copies_select_policy" ON "physical_copies"
  FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."physical_copy_id" = "physical_copies"."id"
        AND "listings"."status" = 'published'
    )
  );
--> statement-breakpoint
CREATE POLICY "physical_copies_insert_owner" ON "physical_copies"
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
--> statement-breakpoint
CREATE POLICY "physical_copies_update_owner" ON "physical_copies"
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
--> statement-breakpoint
CREATE POLICY "physical_copies_delete_owner" ON "physical_copies"
  FOR DELETE USING (auth.uid() = owner_id);
--> statement-breakpoint
CREATE POLICY "listings_select_policy" ON "listings"
  FOR SELECT USING (
    status = 'published' OR seller_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "listings_insert_seller" ON "listings"
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1 FROM "physical_copies"
      WHERE "physical_copies"."id" = "listings"."physical_copy_id"
        AND "physical_copies"."owner_id" = auth.uid()
    )
  );
--> statement-breakpoint
CREATE POLICY "listings_update_seller" ON "listings"
  FOR UPDATE USING (
    auth.uid() = seller_id
  ) WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1 FROM "physical_copies"
      WHERE "physical_copies"."id" = "listings"."physical_copy_id"
        AND "physical_copies"."owner_id" = auth.uid()
    )
  );
--> statement-breakpoint
CREATE POLICY "listings_delete_seller" ON "listings"
  FOR DELETE USING (auth.uid() = seller_id);
--> statement-breakpoint
CREATE POLICY "listing_photos_select_policy" ON "listing_photos"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND ("listings"."status" = 'published' OR "listings"."seller_id" = auth.uid())
    )
  );
--> statement-breakpoint
CREATE POLICY "listing_photos_insert_seller" ON "listing_photos"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND "listings"."seller_id" = auth.uid()
    )
  );
--> statement-breakpoint
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
--> statement-breakpoint
CREATE POLICY "listing_photos_delete_seller" ON "listing_photos"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "listing_photos"."listing_id"
        AND "listings"."seller_id" = auth.uid()
    )
  );
--> statement-breakpoint
CREATE POLICY "comments_select_policy" ON "comments"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "comments"."listing_id"
        AND ("listings"."status" = 'published' OR "listings"."seller_id" = auth.uid())
    )
  );
--> statement-breakpoint
CREATE POLICY "comments_insert_author" ON "comments"
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "comments"."listing_id"
        AND ("listings"."status" = 'published' OR "listings"."seller_id" = auth.uid())
    )
  );
--> statement-breakpoint
CREATE POLICY "comments_update_author" ON "comments"
  FOR UPDATE USING (
    auth.uid() = author_id
  ) WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "comments"."listing_id"
        AND ("listings"."status" = 'published' OR "listings"."seller_id" = auth.uid())
    )
  );
--> statement-breakpoint
CREATE POLICY "comments_delete_author" ON "comments"
  FOR DELETE USING (auth.uid() = author_id);
--> statement-breakpoint
CREATE POLICY "activity_events_select_policy" ON "activity_events"
  FOR SELECT USING (
    event_type IN ('listing.published', 'comment.created')
    OR (event_type = 'favorite.created' AND actor_id = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "favorites_select_owner" ON "favorites"
  FOR SELECT USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "favorites_insert_owner" ON "favorites"
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM "listings"
      WHERE "listings"."id" = "favorites"."listing_id"
        AND "listings"."status" = 'published'
    )
  );
--> statement-breakpoint
CREATE POLICY "favorites_delete_owner" ON "favorites"
  FOR DELETE USING (user_id = auth.uid());
--> statement-breakpoint
GRANT SELECT ON "profiles" TO anon;
--> statement-breakpoint
GRANT SELECT ON "releases" TO anon;
--> statement-breakpoint
GRANT SELECT ON "physical_copies" TO anon;
--> statement-breakpoint
GRANT SELECT ON "listings" TO anon;
--> statement-breakpoint
GRANT SELECT ON "listing_photos" TO anon;
--> statement-breakpoint
GRANT SELECT ON "comments" TO anon;
--> statement-breakpoint
GRANT SELECT ON "activity_events" TO anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "profiles" TO authenticated;
--> statement-breakpoint
GRANT SELECT ON "releases" TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "physical_copies" TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "listings" TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "listing_photos" TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "comments" TO authenticated;
--> statement-breakpoint
GRANT SELECT ON "activity_events" TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "favorites" TO authenticated;
