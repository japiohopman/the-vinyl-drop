import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'path';

interface IdRow {
  id: string;
}

interface ListingRow {
  id: string;
  physical_copy_id: string;
  seller_id: string;
}

describe('Row Level Security (RLS) & Least-Privilege Data API Access (Issue #59)', () => {
  let pg: PGlite;

  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const releaseId = '33333333-3333-4333-8333-333333333333';

  const copyAId = '44444444-4444-4444-8444-444444444444';
  const copyBId = '50000000-0000-4000-8000-000000000000';
  const listingPublishedId = '55555555-5555-4555-8555-555555555555';
  const photoPublishedId = '66666666-6666-4666-8666-666666666666';
  const commentPublishedId = '77777777-7777-4777-8777-777777777777';

  const copyDraftAId = '88888888-8888-4888-8888-888888888888';
  const listingDraftId = '99999999-9999-4999-8999-999999999999';

  it('grants the Supabase Data API only explicitly approved SELECT access', async () => {
    const appTables = [
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

    for (const role of ['anon', 'authenticated']) {
      for (const table of appTables) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
          const result = await pg.query<{ allowed: boolean }>(
            `SELECT has_table_privilege('${role}', 'public.${table}', '${privilege}') AS allowed;`
          );
          expect(result.rows[0].allowed).toBe(false);
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
        const result = await pg.query<{ allowed: boolean }>(
          `SELECT has_table_privilege('${role}', 'public.${table}', 'SELECT') AS allowed;`
        );
        expect(result.rows[0].allowed).toBe(true);
      }
    }

    const authenticatedFavorites = await pg.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('authenticated', 'public.favorites', 'SELECT') AS allowed;`
    );
    const anonymousFavorites = await pg.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('anon', 'public.favorites', 'SELECT') AS allowed;`
    );
    expect(authenticatedFavorites.rows[0].allowed).toBe(true);
    expect(anonymousFavorites.rows[0].allowed).toBe(false);

    for (const table of ['conversations', 'messages', 'orphaned_storage_objects']) {
      for (const role of ['anon', 'authenticated']) {
        const result = await pg.query<{ allowed: boolean }>(
          `SELECT has_table_privilege('${role}', 'public.${table}', 'SELECT') AS allowed;`
        );
        expect(result.rows[0].allowed).toBe(false);
      }
    }
  });

  beforeAll(async () => {
    pg = new PGlite();

    // Setup Supabase auth schema and auth.uid() function for isolated test runner
    await pg.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      BEGIN
        RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    // 1. Apply all database migrations via Drizzle migrator
    const drizzleDir = path.join(process.cwd(), 'drizzle');
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: drizzleDir });

    // 2. Seed initial baseline records as superuser / database owner (bypassing RLS)
    await pg.exec(`
      INSERT INTO "profiles" ("id", "username", "display_name")
      VALUES
        ('${userA}', 'user_a', 'User A'),
        ('${userB}', 'user_b', 'User B');

      INSERT INTO "releases" ("id", "artist", "title", "label", "release_year")
      VALUES
        ('${releaseId}', 'Miles Davis', 'Kind of Blue', 'Columbia', 1959);

      -- PhysicalCopies owned by User A and User B
      INSERT INTO "physical_copies" ("id", "release_id", "owner_id", "media_condition", "sleeve_condition")
      VALUES
        ('${copyAId}', '${releaseId}', '${userA}', 'NM', 'VG+'),
        ('${copyBId}', '${releaseId}', '${userB}', 'M', 'NM');

      INSERT INTO "listings" ("id", "physical_copy_id", "seller_id", "price", "currency", "status")
      VALUES
        ('${listingPublishedId}', '${copyAId}', '${userA}', 4000, 'EUR', 'published');

      INSERT INTO "listing_photos" ("id", "listing_id", "storage_path", "display_order")
      VALUES
        ('${photoPublishedId}', '${listingPublishedId}', 'photos/published.webp', 0);

      INSERT INTO "comments" ("id", "listing_id", "author_id", "content")
      VALUES
        ('${commentPublishedId}', '${listingPublishedId}', '${userB}', 'Great vinyl!');

      -- Draft PhysicalCopy & Listing owned by User A (should be private to User A)
      INSERT INTO "physical_copies" ("id", "release_id", "owner_id", "media_condition", "sleeve_condition")
      VALUES
        ('${copyDraftAId}', '${releaseId}', '${userA}', 'VG', 'VG');

      INSERT INTO "listings" ("id", "physical_copy_id", "seller_id", "price", "currency", "status")
      VALUES
        ('${listingDraftId}', '${copyDraftAId}', '${userA}', 2500, 'EUR', 'draft');

      -- Activity Events
      INSERT INTO "activity_events" ("id", "event_type", "actor_id", "listing_id")
      VALUES
        ('${userA}', 'listing.published', '${userA}', '${listingPublishedId}');

      -- Favorite by User A on Published Listing
      INSERT INTO "favorites" ("id", "user_id", "listing_id")
      VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${userA}', '${listingPublishedId}');

      INSERT INTO "activity_events" ("id", "event_type", "actor_id", "listing_id")
      VALUES
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'favorite.created', '${userA}', '${listingPublishedId}');
    `);
  });

  afterAll(async () => {
    if (pg) {
      await pg.close();
    }
  });

  describe('Anonymous Access (Role: anon)', () => {
    beforeEach(async () => {
      await pg.exec(`SET ROLE anon; SET "request.jwt.claim.sub" = '';`);
    });

    afterEach(async () => {
      await pg.exec(`RESET ROLE;`);
    });

    it('should allow public reads on profiles, releases, published listings, photos, comments, and public activity events', async () => {
      const profiles = await pg.query<IdRow>(`SELECT id FROM profiles;`);
      expect(profiles.rows.length).toBe(2);

      const releases = await pg.query<IdRow>(`SELECT id FROM releases;`);
      expect(releases.rows.length).toBe(1);

      const listings = await pg.query<IdRow>(`SELECT id FROM listings;`);
      expect(listings.rows.length).toBe(1);
      expect(listings.rows[0].id).toBe(listingPublishedId); // draft listing filtered out by RLS

      const photos = await pg.query<IdRow>(`SELECT id FROM listing_photos;`);
      expect(photos.rows.length).toBe(1);

      const comments = await pg.query<IdRow>(`SELECT id FROM comments;`);
      expect(comments.rows.length).toBe(1);

      const activity = await pg.query<IdRow>(`SELECT id FROM activity_events;`);
      expect(activity.rows.length).toBe(1); // favorite.created event filtered out for anon
    });

    it('should deny anonymous access to private favorites table completely', async () => {
      // Table privilege for anon on favorites is revoked
      await expect(pg.query(`SELECT * FROM favorites;`)).rejects.toThrow();
    });

    it('should deny anonymous writes (INSERT, UPDATE, DELETE) across all public tables', async () => {
      const newId = '90000000-0000-4000-8000-000000000000';

      await expect(
        pg.query(`INSERT INTO profiles (id, username) VALUES ('${newId}', 'attacker');`)
      ).rejects.toThrow();

      await expect(
        pg.query(`INSERT INTO releases (id, artist, title) VALUES ('${newId}', 'A', 'T');`)
      ).rejects.toThrow();

      await expect(
        pg.query(`INSERT INTO listings (id, physical_copy_id, seller_id, status) VALUES ('${newId}', '${copyAId}', '${userA}', 'published');`)
      ).rejects.toThrow();

      await expect(
        pg.query(`UPDATE profiles SET username = 'hacked' WHERE id = '${userA}';`)
      ).rejects.toThrow();

      await expect(
        pg.query(`DELETE FROM comments WHERE id = '${commentPublishedId}';`)
      ).rejects.toThrow();
    });
  });

  describe('Authenticated Non-Owner Access (Role: authenticated, sub = User B)', () => {
    beforeEach(async () => {
      await pg.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userB}';`);
    });

    afterEach(async () => {
      await pg.exec(`RESET ROLE;`);
    });

    it('should deny client INSERT and UPDATE on catalogue releases table', async () => {
      const releaseNewId = '91111111-1111-4111-8111-111111111111';
      await expect(
        pg.query(`INSERT INTO releases (id, artist, title) VALUES ('${releaseNewId}', 'Fake', 'Album');`)
      ).rejects.toThrow();

      await expect(
        pg.query(`UPDATE releases SET title = 'Hacked Title' WHERE id = '${releaseId}';`)
      ).rejects.toThrow();
    });

    it('should prevent User B from creating a listing for User A physical copy', async () => {
      const forgedListingId = '92222222-2222-4222-8222-222222222222';
      // User B sets seller_id = User B, but physical_copy_id belongs to User A
      await expect(
        pg.query(`INSERT INTO listings (id, physical_copy_id, seller_id, status) VALUES ('${forgedListingId}', '${copyAId}', '${userB}', 'published');`)
      ).rejects.toThrow();
    });

    it('should prevent User B from updating their listing to reassign physical_copy_id to User A physical copy', async () => {
      const userBListingId = '96666666-6666-4666-8666-666666666666';

      // 1. User B creates a listing for their own physical copy (copyBId)
      await pg.query(
        `INSERT INTO listings (id, physical_copy_id, seller_id, status) VALUES ('${userBListingId}', '${copyBId}', '${userB}', 'published');`
      );

      // 2. User B attempts to update physical_copy_id to User A's physical copy (copyAId)
      await expect(
        pg.query(`UPDATE listings SET physical_copy_id = '${copyAId}' WHERE id = '${userBListingId}';`)
      ).rejects.toThrow();

      // 3. Verify physical_copy_id remains copyBId
      const listingRes = await pg.query<ListingRow>(
        `SELECT id, physical_copy_id, seller_id FROM listings WHERE id = '${userBListingId}';`
      );
      expect(listingRes.rows.length).toBe(1);
      expect(listingRes.rows[0].physical_copy_id).toBe(copyBId);
      expect(listingRes.rows[0].seller_id).toBe(userB);
    });

    it('should prevent User B from forging activity events via Data API', async () => {
      const forgedEventId = '93333333-3333-4333-8333-333333333333';
      await expect(
        pg.query(`INSERT INTO activity_events (id, event_type, actor_id, listing_id) VALUES ('${forgedEventId}', 'listing.published', '${userB}', '${listingPublishedId}');`)
      ).rejects.toThrow();

      await expect(
        pg.query(`DELETE FROM activity_events WHERE id = '${userA}';`)
      ).rejects.toThrow();
    });

    it('should prevent User B from updating a comment to target User A draft listing', async () => {
      // User B tries to update their comment on published listing to reference User A's draft listing
      await expect(
        pg.query(`UPDATE comments SET listing_id = '${listingDraftId}' WHERE id = '${commentPublishedId}';`)
      ).rejects.toThrow();
    });

    it('should hide draft listings and draft physical copies owned by User A', async () => {
      const draftListings = await pg.query<IdRow>(`SELECT id FROM listings WHERE id = '${listingDraftId}';`);
      expect(draftListings.rows.length).toBe(0);

      const draftCopies = await pg.query<IdRow>(`SELECT id FROM physical_copies WHERE id = '${copyDraftAId}';`);
      expect(draftCopies.rows.length).toBe(0);
    });

    it('should hide User A private favorites from User B', async () => {
      const userAFavorites = await pg.query<IdRow>(`SELECT id FROM favorites;`);
      expect(userAFavorites.rows.length).toBe(0);

      const userAActivity = await pg.query<IdRow>(`SELECT id FROM activity_events WHERE event_type = 'favorite.created';`);
      expect(userAActivity.rows.length).toBe(0);
    });

    it('should deny direct Data API UPDATE and DELETE even for a non-owner', async () => {
      await expect(
        pg.query(`UPDATE profiles SET display_name = 'Hacked A' WHERE id = '${userA}';`)
      ).rejects.toThrow();

      await expect(
        pg.query(`DELETE FROM listings WHERE id = '${listingPublishedId}';`)
      ).rejects.toThrow();

      const profile = await pg.query<{ display_name: string }>(
        `SELECT display_name FROM profiles WHERE id = '${userA}';`
      );
      expect(profile.rows[0].display_name).toBe('User A');
    });
  });

  describe('Record Owner / Author Access (Role: authenticated, sub = User A)', () => {
    beforeEach(async () => {
      await pg.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userA}';`);
    });

    afterEach(async () => {
      await pg.exec(`RESET ROLE;`);
    });

    it('should allow User A to see their own draft listing and physical copy', async () => {
      const draftListings = await pg.query<IdRow>(`SELECT id FROM listings WHERE id = '${listingDraftId}';`);
      expect(draftListings.rows.length).toBe(1);

      const draftCopies = await pg.query<IdRow>(`SELECT id FROM physical_copies WHERE id = '${copyDraftAId}';`);
      expect(draftCopies.rows.length).toBe(1);
    });

    it('should allow User A to see their own private favorites and private activity events', async () => {
      const userAFavorites = await pg.query<IdRow>(`SELECT id FROM favorites;`);
      expect(userAFavorites.rows.length).toBe(1);

      const userAActivity = await pg.query<IdRow>(`SELECT id FROM activity_events WHERE event_type = 'favorite.created';`);
      expect(userAActivity.rows.length).toBe(1);
    });

    it('should deny direct Data API INSERT even when the authenticated user owns the copy', async () => {
      const newListingId = '94444444-4444-4444-8444-444444444444';

      await expect(
        pg.query(`INSERT INTO listings (id, physical_copy_id, seller_id, status) VALUES ('${newListingId}', '${copyDraftAId}', '${userA}', 'draft');`)
      ).rejects.toThrow();

      const res = await pg.query<IdRow>(`SELECT id FROM listings WHERE id = '${newListingId}';`);
      expect(res.rows.length).toBe(0);
    });

    it('should deny direct Data API UPDATE even when the authenticated user owns the profile and listing', async () => {
      await expect(
        pg.query(`UPDATE profiles SET display_name = 'User A Updated' WHERE id = '${userA}';`)
      ).rejects.toThrow();

      await expect(
        pg.query(`UPDATE listings SET price = 4500 WHERE id = '${listingPublishedId}';`)
      ).rejects.toThrow();

      const profile = await pg.query<{ display_name: string }>(
        `SELECT display_name FROM profiles WHERE id = '${userA}';`
      );
      expect(profile.rows[0].display_name).toBe('User A');

      const listing = await pg.query<{ price: number }>(
        `SELECT price FROM listings WHERE id = '${listingPublishedId}';`
      );
      expect(listing.rows[0].price).toBe(4000);
    });

    it('should deny direct Data API INSERT and DELETE on favorites while retaining owner reads', async () => {
      const favId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

      await expect(
        pg.query(`DELETE FROM favorites WHERE id = '${favId}';`)
      ).rejects.toThrow();

      const newFavId = '95555555-5555-4555-8555-555555555555';
      await expect(
        pg.query(`INSERT INTO favorites (id, user_id, listing_id) VALUES ('${newFavId}', '${userA}', '${listingPublishedId}');`)
      ).rejects.toThrow();

      const selectFav = await pg.query<IdRow>(`SELECT id FROM favorites WHERE id = '${favId}';`);
      expect(selectFav.rows.length).toBe(1);
    });
  });
});
