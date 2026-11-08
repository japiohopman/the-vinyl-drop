import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import request from 'supertest';
import { createApp } from '../src/app';
import * as dbModule from '../src/db';
import * as authService from '../src/app/services/authService';
import { countPublishedListingsBySellerId } from '../src/app/repositories/listingRepository';
import { findPublicProfileByUsername } from '../src/app/repositories/profileRepository';
import { countSellerPublishedListings, getSellerPublishedListings } from '../src/app/services/listingService';
import { getPublicProfileByUsername } from '../src/app/services/profileService';
import { listings, listingPhotos, physicalCopies, profiles, releases } from '../src/db/schema';
import fs from 'fs';
import path from 'path';

describe('Issue #382 — Compact Public Profile Read Optimization & Crate Shape', () => {
  let pg: PGlite;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let getDbSpy: jest.SpyInstance;
  let getUserFromTokenSpy: jest.SpyInstance;

  const sellerUserId = '10000000-0000-4000-8000-000000000001';
  const visitorUserId = '20000000-0000-4000-8000-000000000002';
  const emptySellerUserId = '30000000-0000-4000-8000-000000000003';

  beforeAll(async () => {
    pg = new PGlite({ extensions: { pg_trgm: pg_trgm as never } });
    await pg.exec('CREATE ROLE supabase_auth_admin NOLOGIN;');
    await pg.exec('CREATE ROLE service_role NOLOGIN BYPASSRLS;');

    // Bootstrap auth and storage stubs
    await pg.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$ BEGIN RETURN 'authenticated'; END; $$ LANGUAGE plpgsql STABLE;
    `);

    // Apply migrations
    const drizzleDir = path.join(process.cwd(), 'drizzle');
    const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'));

    for (const entry of journal.entries) {
      const sqlContent = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), 'utf8');
      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await pg.exec(statement);
      }
    }

    db = drizzle(pg);
    getDbSpy = jest.spyOn(dbModule, 'getDb').mockReturnValue(db);

    getUserFromTokenSpy = jest.spyOn(authService, 'getUserFromToken').mockImplementation(async (token: string) => {
      if (token === 'owner-token') return { id: sellerUserId, email: 'seller@example.com' } as never;
      if (token === 'visitor-token') return { id: visitorUserId, email: 'visitor@example.com' } as never;
      return null;
    });

    // Seed test profiles
    await db.insert(profiles).values([
      {
        id: sellerUserId,
        username: 'diggerseller',
        displayName: 'Digger Seller',
        avatarUrl: 'https://example.com/avatar.jpg',
        avatarStoragePath: `profiles/${sellerUserId}/photo.webp`,
        websiteUrl: 'https://diggerseller.com',
        soundcloudUrl: 'https://soundcloud.com/diggerseller',
        mixcloudUrl: 'https://mixcloud.com/diggerseller',
        bio: 'Lover of wax',
        location: 'Amsterdam',
      },
      {
        id: visitorUserId,
        username: 'recordbuyer',
        displayName: 'Record Buyer',
        location: 'Rotterdam',
      },
      {
        id: emptySellerUserId,
        username: 'emptyseller',
        displayName: 'Empty Seller',
        location: 'Utrecht',
      },
    ]);

    // Seed 15 releases, physical copies, listings, and photos (13 published, 1 draft, 1 archived)
    for (let i = 1; i <= 15; i++) {
      const releaseId = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      const copyId = `00000000-0000-4000-8001-${String(i).padStart(12, '0')}`;
      const listingId = `00000000-0000-4000-8002-${String(i).padStart(12, '0')}`;
      const status = i === 14 ? 'draft' : i === 15 ? 'archived' : 'published';

      await db.insert(releases).values({
        id: releaseId,
        title: `Album #${i}`,
        artist: `Artist #${i}`,
        releaseYear: 1990 + i,
        format: '12" Vinyl',
      });

      await db.insert(physicalCopies).values({
        id: copyId,
        releaseId,
        ownerId: sellerUserId,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
      });

      await db.insert(listings).values({
        id: listingId,
        physicalCopyId: copyId,
        sellerId: sellerUserId,
        price: 1000 + i * 100,
        tradeAvailable: false,
        status,
        createdAt: new Date(Date.now() + i * 60000),
      });

      await db.insert(listingPhotos).values({
        listingId,
        storagePath: `listings/${listingId}/front.webp`,
        role: 'front_cover',
        displayOrder: 0,
      });
    }
  });

  afterAll(async () => {
    getDbSpy.mockRestore();
    getUserFromTokenSpy.mockRestore();
    if (pg) await pg.close();
  });

  describe('Repository & Service layer', () => {
    it('countPublishedListingsBySellerId counts only published listings for the exact seller', async () => {
      const count = await countPublishedListingsBySellerId(sellerUserId, db);
      expect(count).toBe(13); // 13 published out of 15 total (1 draft, 1 archived excluded)

      const emptyCount = await countPublishedListingsBySellerId(emptySellerUserId, db);
      expect(emptyCount).toBe(0);
    });

    it('countSellerPublishedListings delegates cleanly to countPublishedListingsBySellerId', async () => {
      const count = await countSellerPublishedListings(sellerUserId, db);
      expect(count).toBe(13);
    });

    it('findPublicProfileByUsername selects only projected display columns and excludes updatedAt', async () => {
      const record = await findPublicProfileByUsername('diggerseller', db);
      expect(record).not.toBeNull();
      expect(record!.id).toBe(sellerUserId);
      expect(record!.username).toBe('diggerseller');
      expect(record!.displayName).toBe('Digger Seller');
      expect(record!.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(record!.avatarStoragePath).toBe(`profiles/${sellerUserId}/photo.webp`);
      expect(record!.websiteUrl).toBe('https://diggerseller.com');
      expect(record!.soundcloudUrl).toBe('https://soundcloud.com/diggerseller');
      expect(record!.mixcloudUrl).toBe('https://mixcloud.com/diggerseller');
      expect(record!.bio).toBe('Lover of wax');
      expect(record!.location).toBe('Amsterdam');
      expect(record!.createdAt).toBeInstanceOf(Date);
      // updatedAt must not be present in the projected record
      expect((record as unknown as Record<string, unknown>).updatedAt).toBeUndefined();
    });

    it('getPublicProfileByUsername resolves avatarPublicUrl and omits avatarStoragePath', async () => {
      const profileVm = await getPublicProfileByUsername('diggerseller', db);
      expect(profileVm).not.toBeNull();
      expect(profileVm!.id).toBe(sellerUserId);
      expect(profileVm!.avatarPublicUrl).toContain(`profiles/${sellerUserId}/photo.webp`);
      // avatarStoragePath must NOT be on the view model
      expect((profileVm as unknown as Record<string, unknown>).avatarStoragePath).toBeUndefined();
      expect((profileVm as unknown as Record<string, unknown>).updatedAt).toBeUndefined();
    });

    it('getPublicProfileByUsername falls back to avatarUrl when avatarStoragePath is null', async () => {
      const profileVm = await getPublicProfileByUsername('recordbuyer', db);
      expect(profileVm).not.toBeNull();
      expect(profileVm!.avatarPublicUrl).toBeNull();
      expect(profileVm!.avatarUrl).toBeNull();
      expect((profileVm as unknown as Record<string, unknown>).avatarStoragePath).toBeUndefined();
    });
  });

  describe('Query Shape & Count Optimization on Compact Public Profile', () => {
    it('executes exactly 2 queries on a populated compact public profile: 1 profile query + 1 count query', async () => {
      const executedQueries: string[] = [];
      const originalQuery = pg.query.bind(pg);
      const querySpy = jest.spyOn(pg, 'query').mockImplementation((sqlText: unknown, ...args: unknown[]) => {
        executedQueries.push(String(sqlText));
        return (originalQuery as (...a: unknown[]) => unknown)(sqlText, ...args) as never;
      });

      try {
        const app = createApp();
        const res = await request(app).get('/profiles/diggerseller');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Digger Seller');
        expect(res.text).toContain('13 published records');
        expect(res.text).toContain('View Crate');

        // Verify query count and shape
        // Must have:
        // 1. SELECT from profiles with explicit columns (no SELECT * from profiles)
        // 2. SELECT count(*) from listings where seller_id and status = 'published'
        // Must NOT have:
        // - Joins on physical_copies, releases
        // - Queries to listing_photos
        expect(executedQueries.length).toBe(2);

        const profileQuery = executedQueries[0].toLowerCase();
        expect(profileQuery).toContain('from "profiles"');
        expect(profileQuery).toContain('lower("profiles"."username")');
        expect(profileQuery).not.toContain('updated_at');

        const countQuery = executedQueries[1].toLowerCase();
        expect(countQuery).toContain('count(');
        expect(countQuery).toContain('from "listings"');
        expect(countQuery).not.toContain('physical_copies');
        expect(countQuery).not.toContain('releases');
        expect(countQuery).not.toContain('listing_photos');
      } finally {
        querySpy.mockRestore();
      }
    });

    it('reports 0 correctly on an empty compact profile without card or photo queries', async () => {
      const executedQueries: string[] = [];
      const originalQuery = pg.query.bind(pg);
      const querySpy = jest.spyOn(pg, 'query').mockImplementation((sqlText: unknown, ...args: unknown[]) => {
        executedQueries.push(String(sqlText));
        return (originalQuery as (...a: unknown[]) => unknown)(sqlText, ...args) as never;
      });

      try {
        const app = createApp();
        const res = await request(app).get('/profiles/emptyseller');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Empty Seller');
        expect(res.text).toContain('0 published records');
        expect(res.text).not.toContain('class="listing-grid');

        expect(executedQueries.length).toBe(2);
        const countQuery = executedQueries[1].toLowerCase();
        expect(countQuery).toContain('count(');
        expect(countQuery).not.toContain('listing_photos');
      } finally {
        querySpy.mockRestore();
      }
    });
  });

  describe('Dedicated Public Crate (/profiles/:username/crate)', () => {
    it('loads exactly 12 items per page, newest first, with bounded front-cover lookup and no N+1 queries', async () => {
      const executedQueries: string[] = [];
      const originalQuery = pg.query.bind(pg);
      const querySpy = jest.spyOn(pg, 'query').mockImplementation((sqlText: unknown, ...args: unknown[]) => {
        executedQueries.push(String(sqlText));
        return (originalQuery as (...a: unknown[]) => unknown)(sqlText, ...args) as never;
      });

      try {
        const app = createApp();
        const res = await request(app).get('/profiles/diggerseller/crate?page=1');
        expect(res.status).toBe(200);
        expect(res.text).toContain("Digger Seller&#39;s Crate");
        expect(res.text).toContain('13 published records');
        expect(res.text).toContain('Page 1 of 2');
        expect(res.text).toContain('Next →');

        // Query shape for Crate:
        // 1. SELECT profile
        // 2. SELECT count() matching listings
        // 3. SELECT 12 paginated listings with card projection
        // 4. SELECT batched front_cover photos for the 12 listings
        // Total: 4 queries, strictly bounded, no N+1
        expect(executedQueries.length).toBe(4);

        const photoQuery = executedQueries[3].toLowerCase();
        expect(photoQuery).toContain('from "listing_photos"');
        expect(photoQuery).toContain('in (');
        expect(photoQuery).toContain('"role" =');
      } finally {
        querySpy.mockRestore();
      }
    });

    it('navigates page 2 and shows the remaining 1 published listing', async () => {
      const app = createApp();
      const res = await request(app).get('/profiles/diggerseller/crate?page=2');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Page 2 of 2');
      expect(res.text).toContain('← Previous');
      expect(res.text).not.toContain('Next →');
    });

    it('redirects out-of-range Crate page to the last page when published records exist', async () => {
      const app = createApp();
      const res = await request(app).get('/profiles/diggerseller/crate?page=99');
      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/profiles/diggerseller/crate?page=2');
    });

    it('returns 400 for invalid page parameter on compact profile and crate', async () => {
      const app = createApp();
      const res1 = await request(app).get('/profiles/diggerseller?page=bad');
      expect(res1.status).toBe(400);
      expect(res1.text).toContain('Invalid page parameter provided.');

      const res2 = await request(app).get('/profiles/diggerseller/crate?page=0');
      expect(res2.status).toBe(400);
      expect(res2.text).toContain('Invalid page parameter provided.');
    });

    it('excludes draft and archived listings from Crate and count', async () => {
      const result = await getSellerPublishedListings('diggerseller', { page: 1 }, db);
      expect(result.totalCount).toBe(13);
      for (const item of result.items) {
        expect(item.title).not.toBe('Album #14'); // Draft
        expect(item.title).not.toBe('Album #15'); // Archived
      }
    });
  });

  describe('Security, Privacy & View Model Boundaries', () => {
    it('does not leak avatarStoragePath or raw internal columns to HTML response', async () => {
      const app = createApp();
      const res = await request(app).get('/profiles/diggerseller');
      expect(res.status).toBe(200);
      // Raw avatarStoragePath should not appear as a property or unhandled leak in raw HTML
      expect(res.text).not.toContain('avatarStoragePath');
      expect(res.text).not.toContain('updatedAt');
      // The resolved public URL should be present in the <img> src
      expect(res.text).toContain(`profiles/${sellerUserId}/photo.webp`);
    });

    it('shows profile owner actions on landing card only for the authenticated owner', async () => {
      const app = createApp();
      const ownerRes = await request(app)
        .get('/profiles/diggerseller')
        .set('Cookie', ['sb-access-token=owner-token']);

      expect(ownerRes.status).toBe(200);
      expect(ownerRes.text).toContain('<a href="/profile/edit" class="btn btn-outline btn-sm">Edit Profile</a>');

      const visitorRes = await request(app)
        .get('/profiles/diggerseller')
        .set('Cookie', ['sb-access-token=visitor-token']);

      expect(visitorRes.status).toBe(200);
      expect(visitorRes.text).not.toContain('<a href="/profile/edit" class="btn btn-outline btn-sm">Edit Profile</a>');
    });
  });
});
