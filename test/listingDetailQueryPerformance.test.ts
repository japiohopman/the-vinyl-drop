import { eq } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app';
import * as dbModule from '../src/db';
import * as authService from '../src/app/services/authService';
import { getPublicListingDetailsForView } from '../src/app/services/listingService';
import { getListingCommentsForResolvedListing } from '../src/app/services/commentService';
import { AuthorizationError, NotFoundError } from '../src/app/services/errors';
import { comments, favorites, listings, listingPhotos, physicalCopies, profiles, releases } from '../src/db/schema';

describe('Issue #384 — Public listing detail query fan-out and projections', () => {
  let pg: PGlite;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let getDbSpy: jest.SpyInstance;
  let getUserFromTokenSpy: jest.SpyInstance;

  const sellerId = '81000000-0000-4000-8000-000000000001';
  const visitorId = '81000000-0000-4000-8000-000000000002';
  const releaseId = '82000000-0000-4000-8000-000000000001';
  const draftReleaseId = '82000000-0000-4000-8000-000000000002';
  const copyId = '83000000-0000-4000-8000-000000000001';
  const draftCopyId = '83000000-0000-4000-8000-000000000002';
  const listingId = '84000000-0000-4000-8000-000000000001';
  const draftListingId = '84000000-0000-4000-8000-000000000002';

  beforeAll(async () => {
    pg = new PGlite({ extensions: { pg_trgm: pg_trgm as never } });
    await pg.exec('CREATE ROLE supabase_auth_admin NOLOGIN;');
    await pg.exec('CREATE ROLE service_role NOLOGIN BYPASSRLS;');
    await pg.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$ BEGIN RETURN 'authenticated'; END; $$ LANGUAGE plpgsql STABLE;
    `);

    const drizzleDir = path.join(process.cwd(), 'drizzle');
    const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'));
    for (const entry of journal.entries) {
      const sqlContent = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), 'utf8');
      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
      for (const statement of statements) {
        await pg.exec(statement);
      }
    }

    db = drizzle(pg);
    getDbSpy = jest.spyOn(dbModule, 'getDb').mockReturnValue(db);
    getUserFromTokenSpy = jest.spyOn(authService, 'getUserFromToken').mockImplementation(async (token: string) => {
      if (token === 'buyer-token') return { id: visitorId, email: 'buyer@example.com' } as never;
      if (token === 'seller-token') return { id: sellerId, email: 'seller@example.com' } as never;
      return null;
    });

    await db.insert(profiles).values([
      {
        id: sellerId,
        username: 'joined_seller',
        displayName: 'Joined Seller',
        avatarUrl: 'https://cdn.example.com/seller-avatar.webp',
        bio: 'Private profile text not required by listing templates',
        websiteUrl: 'https://seller.example.com',
        location: 'Amsterdam',
      },
      {
        id: visitorId,
        username: 'joined_buyer',
        displayName: 'Joined Buyer',
        avatarUrl: 'https://cdn.example.com/buyer-avatar.webp',
        bio: 'Buyer profile text',
        websiteUrl: 'https://buyer.example.com',
      },
    ]);

    await db.insert(releases).values([
      {
        id: releaseId,
        title: 'Blue Spirits',
        artist: 'Blue Note All-Stars',
        label: 'Blue Note',
        catalogueNumber: 'BST-841',
        releaseYear: 1967,
        format: 'Vinyl, LP, Album',
        genre: 'Jazz',
        coverArtUrl: 'https://cdn.example.com/catalogue-blue-spirits.webp',
        youtubeVideoId: 'abcdefghijk',
        externalSource: 'private-import-source',
        externalId: 'private-external-id',
      },
      {
        id: draftReleaseId,
        title: 'Private Draft Pressing',
        artist: 'Draft Artist',
        releaseYear: 1994,
        format: '12" Vinyl',
      },
    ]);

    await db.insert(physicalCopies).values([
      {
        id: copyId,
        releaseId,
        ownerId: sellerId,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
        notes: 'Clean sleeve, light hairlines.',
      },
      {
        id: draftCopyId,
        releaseId: draftReleaseId,
        ownerId: sellerId,
        mediaCondition: 'NM',
        sleeveCondition: 'VG+',
        notes: 'Seller-only draft notes.',
      },
    ]);

    await db.insert(listings).values([
      {
        id: listingId,
        physicalCopyId: copyId,
        sellerId,
        price: 3250,
        currency: 'EUR',
        tradeAvailable: true,
        description: 'A well-kept original pressing.',
        status: 'published',
      },
      {
        id: draftListingId,
        physicalCopyId: draftCopyId,
        sellerId,
        price: 4500,
        currency: 'EUR',
        tradeAvailable: false,
        description: 'Not public until the seller publishes it.',
        status: 'draft',
      },
    ]);

    await db.insert(listingPhotos).values([
      {
        id: '85000000-0000-4000-8000-000000000002',
        listingId,
        storagePath: `listings/${listingId}/back.webp`,
        sourceStoragePath: `private-source/${listingId}/back-original.webp`,
        sourceIsLegacy: false,
        editorState: {
          version: 1,
          sourceWidth: 1200,
          sourceHeight: 1200,
          corners: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1000 },
            { x: 0, y: 1000 },
          ],
          adjustments: {
            exposure: 0,
            blackPoint: 0,
            shadows: 0,
            contrast: 0,
            highlights: 0,
            whitePoint: 100,
            gamma: 1,
            temperature: 0,
            tint: 0,
            saturation: 0,
          },
        },
        role: 'back_cover',
        displayOrder: 1,
        altText: 'Back cover of Blue Spirits',
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
      },
      {
        id: '85000000-0000-4000-8000-000000000003',
        listingId,
        storagePath: `listings/${listingId}/detail.webp`,
        sourceStoragePath: `private-source/${listingId}/detail-original.webp`,
        sourceIsLegacy: false,
        editorState: {
          version: 1,
          sourceWidth: 1200,
          sourceHeight: 1200,
          corners: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1000 },
            { x: 0, y: 1000 },
          ],
          adjustments: {
            exposure: 0,
            blackPoint: 0,
            shadows: 0,
            contrast: 0,
            highlights: 0,
            whitePoint: 100,
            gamma: 1,
            temperature: 0,
            tint: 0,
            saturation: 0,
          },
        },
        role: 'detail',
        displayOrder: 0,
        altText: 'Detail close-up for Blue Spirits',
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      },
      {
        id: '85000000-0000-4000-8000-000000000001',
        listingId,
        storagePath: `listings/${listingId}/front.webp`,
        sourceStoragePath: `private-source/${listingId}/front-original.webp`,
        sourceIsLegacy: false,
        editorState: {
          version: 1,
          sourceWidth: 1200,
          sourceHeight: 1200,
          corners: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1000 },
            { x: 0, y: 1000 },
          ],
          adjustments: {
            exposure: 0,
            blackPoint: 0,
            shadows: 0,
            contrast: 0,
            highlights: 0,
            whitePoint: 100,
            gamma: 1,
            temperature: 0,
            tint: 0,
            saturation: 0,
          },
        },
        role: 'front_cover',
        displayOrder: 0,
        altText: 'Front cover of Blue Spirits',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
    ]);

    await db.insert(comments).values([
      {
        id: '86000000-0000-4000-8000-000000000001',
        listingId,
        authorId: visitorId,
        content: 'Would you consider a local pickup?',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        id: '86000000-0000-4000-8000-000000000002',
        listingId,
        authorId: sellerId,
        content: 'Yes, pickup in Amsterdam is possible.',
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      },
      {
        id: '86000000-0000-4000-8000-000000000003',
        listingId: draftListingId,
        authorId: sellerId,
        content: 'A private draft comment.',
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
      },
    ]);

    await db.insert(favorites).values({
      userId: visitorId,
      listingId,
    });
  });

  afterAll(async () => {
    getDbSpy.mockRestore();
    getUserFromTokenSpy.mockRestore();
    if (pg) await pg.close();
  });

  /** Record database statements issued while running an isolated test request or service call. */
  async function captureQueries<T>(run: () => Promise<T>): Promise<{ result: T; queries: string[] }> {
    const queries: string[] = [];
    const originalQuery = pg.query.bind(pg);
    const querySpy = jest.spyOn(pg, 'query').mockImplementation((sqlText: unknown, ...args: unknown[]) => {
      queries.push(String(sqlText));
      return (originalQuery as (...args: unknown[]) => unknown)(sqlText, ...args) as never;
    });
    try {
      const result = await run();
      return { result, queries };
    } finally {
      querySpy.mockRestore();
    }
  }

  it('renders the public listing detail with exactly 3 SELECTs: joined detail, photos, comments', async () => {
    const { result: res, queries } = await captureQueries(() => request(createApp()).get(`/listings/${listingId}`));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Blue Spirits');
    expect(res.text).toContain('Blue Note All-Stars');
    expect(res.text).toContain('Joined Seller');
    expect(res.text).toContain('A well-kept original pressing.');
    expect(res.text).toContain('Clean sleeve, light hairlines.');
    expect(res.text).toContain('Front cover of Blue Spirits');
    expect(res.text).toContain('Back cover of Blue Spirits');
    expect(res.text).toContain('Would you consider a local pickup?');
    expect(res.text).toContain('Yes, pickup in Amsterdam is possible.');
    expect(res.text).not.toContain('private-source');
    expect(res.text).not.toContain('internalEditorSecret');

    expect(queries).toHaveLength(3);
    expect(queries[0].toLowerCase()).toContain('inner join "physical_copies"');
    expect(queries[0].toLowerCase()).toContain('inner join "releases"');
    expect(queries[0].toLowerCase()).toContain('inner join "profiles"');
    expect(queries[0].toLowerCase()).toContain('from "listings"');
    expect(queries[1].toLowerCase()).toContain('from "listing_photos"');
    expect(queries[2].toLowerCase()).toContain('from "comments"');
    for (const query of queries) {
      expect(query.toLowerCase()).not.toContain('source_storage_path');
      expect(query.toLowerCase()).not.toContain('source_is_legacy');
      expect(query.toLowerCase()).not.toContain('editor_state');
    }
  });

  it('keeps authenticated favorite state and uses exactly 4 SELECTs', async () => {
    const { result: res, queries } = await captureQueries(() =>
      request(createApp())
        .get(`/listings/${listingId}`)
        .set('Cookie', ['sb-access-token=buyer-token'])
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('is-saved');
    expect(res.text).toContain('aria-pressed="true"');
    expect(queries).toHaveLength(4);
    expect(queries[0].toLowerCase()).toContain('from "listings"');
    expect(queries[1].toLowerCase()).toContain('from "listing_photos"');
    expect(queries[2].toLowerCase()).toContain('from "comments"');
    expect(queries[3].toLowerCase()).toContain('from "favorites"');
  });

  it('renders the dedicated public comments page with exactly 3 SELECTs and chronological comments', async () => {
    const { result: res, queries } = await captureQueries(() =>
      request(createApp()).get(`/listings/${listingId}/comments`)
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('Comments / Ask a question');
    expect(res.text).toContain('Blue Spirits');
    expect(res.text).toContain('Joined Seller');
    expect(res.text).toContain('Front cover of Blue Spirits');
    expect(res.text.indexOf('Would you consider a local pickup?')).toBeLessThan(
      res.text.indexOf('Yes, pickup in Amsterdam is possible.')
    );
    expect(res.text).not.toContain('private-source');
    expect(res.text).not.toContain('internalEditorSecret');
    expect(queries).toHaveLength(3);
    expect(queries[0].toLowerCase()).toContain('from "listings"');
    expect(queries[1].toLowerCase()).toContain('from "listing_photos"');
    expect(queries[2].toLowerCase()).toContain('from "comments"');
  });

  it('preserves seller access to their own unpublished listing and its comments', async () => {
    const { result: detail, queries: detailQueries } = await captureQueries(() =>
      request(createApp())
        .get(`/listings/${draftListingId}`)
        .set('Cookie', ['sb-access-token=seller-token'])
    );
    expect(detail.status).toBe(200);
    expect(detail.text).toContain('Private Draft Pressing');
    expect(detail.text).toContain('Seller-only draft notes.');
    expect(detailQueries).toHaveLength(4);

    const { result: commentsPage, queries: commentQueries } = await captureQueries(() =>
      request(createApp())
        .get(`/listings/${draftListingId}/comments`)
        .set('Cookie', ['sb-access-token=seller-token'])
    );
    expect(commentsPage.status).toBe(200);
    expect(commentsPage.text).toContain('A private draft comment.');
    expect(commentQueries).toHaveLength(3);
  });

  it('keeps unpublished listings unavailable to other viewers without querying photos or comments', async () => {
    const { result: detail, queries: detailQueries } = await captureQueries(() =>
      request(createApp())
        .get(`/listings/${draftListingId}`)
        .set('Cookie', ['sb-access-token=buyer-token'])
    );
    expect(detail.status).toBe(404);
    expect(detail.text).not.toContain('Private Draft Pressing');
    expect(detailQueries).toHaveLength(1);

    const { result: commentsPage, queries: commentQueries } = await captureQueries(() =>
      request(createApp())
        .get(`/listings/${draftListingId}/comments`)
        .set('Cookie', ['sb-access-token=buyer-token'])
    );
    expect(commentsPage.status).toBe(404);
    expect(commentsPage.text).not.toContain('A private draft comment.');
    expect(commentQueries).toHaveLength(1);
  });

  it('returns the same 404 for an unknown listing without attempting child reads', async () => {
    const missingId = '84000000-0000-4000-8000-000000000099';
    const { result: detail, queries: detailQueries } = await captureQueries(() =>
      request(createApp()).get(`/listings/${missingId}`)
    );
    expect(detail.status).toBe(404);
    expect(detailQueries).toHaveLength(1);

    const { result: commentsPage, queries: commentQueries } = await captureQueries(() =>
      request(createApp()).get(`/listings/${missingId}/comments`)
    );
    expect(commentsPage.status).toBe(404);
    expect(commentQueries).toHaveLength(1);
  });

  it('returns only public photo and seller projections from the service view model', async () => {
    const detail = await getPublicListingDetailsForView(listingId, undefined, db);
    expect(Object.keys(detail.seller).sort()).toEqual(['displayName', 'id', 'username']);
    expect(Object.keys(detail.photos[0]).sort()).toEqual(['altText', 'displayOrder', 'id', 'publicUrl', 'role']);
    expect(detail.photos.map((photo) => photo.id)).toEqual([
      '85000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000003',
      '85000000-0000-4000-8000-000000000002',
    ]);
    expect(detail.photos.map((photo) => photo.role)).toEqual(['front_cover', 'detail', 'back_cover']);
    expect(detail.photos[0].publicUrl).toContain(`listings/${listingId}/front.webp`);
    expect(JSON.stringify(detail)).not.toContain('private-source');
    expect(JSON.stringify(detail)).not.toContain('internalEditorSecret');
    expect(JSON.stringify(detail)).not.toContain('sourceStoragePath');
    expect(JSON.stringify(detail)).not.toContain('sourceIsLegacy');
    expect(JSON.stringify(detail)).not.toContain('editorState');
  });

  it('rechecks the resolved listing ID and published-or-owner boundary in the comment service', async () => {
    await expect(
      getListingCommentsForResolvedListing(
        listingId,
        { id: listingId, status: 'draft', sellerId },
        visitorId,
        db
      )
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      getListingCommentsForResolvedListing(
        draftListingId,
        { id: listingId, status: 'published', sellerId },
        visitorId,
        db
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('treats uppercase and lowercase forms of the same UUID as the same listing', async () => {
    const { result, queries } = await captureQueries(() =>
      getListingCommentsForResolvedListing(
        listingId.toUpperCase(),
        { id: listingId, status: 'published', sellerId },
        undefined,
        db
      )
    );

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Would you consider a local pickup?');
    expect(queries).toHaveLength(1);
  });

  it('blocks comments when the listing is unpublished after the detail snapshot was resolved', async () => {
    await db.update(listings).set({ status: 'draft' }).where(eq(listings.id, listingId));

    try {
      const { queries } = await captureQueries(async () => {
        await expect(
          getListingCommentsForResolvedListing(
            listingId,
            { id: listingId, status: 'published', sellerId },
            visitorId,
            db
          )
        ).rejects.toBeInstanceOf(AuthorizationError);
      });

      expect(queries).toHaveLength(1);
      expect(queries[0].toLowerCase()).toContain('left join "comments"');
      expect(queries[0].toLowerCase()).toContain('"listings"."status"');
      expect(queries[0].toLowerCase()).toContain('"listings"."seller_id"');
    } finally {
      await db.update(listings).set({ status: 'published' }).where(eq(listings.id, listingId));
    }
  });
});