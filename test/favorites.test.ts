import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;

jest.mock('../src/db', () => ({
  getDb: jest.fn(() => testDb),
}));

import {
  addFavorite,
  removeFavorite,
  isListingFavorited,
} from '../src/app/services/favoriteService';
import { addFavorite as addFavoriteInRepo, getFavoriteCount } from '../src/app/repositories/favoriteRepository';
import { getRecentActivityEvents } from '../src/app/repositories/activityRepository';
import {
  clearNotificationListeners,
  onNotification,
  NotificationEvent,
} from '../src/app/services/notificationHooks';
import { postFavoriteListing, postUnfavoriteListing } from '../src/app/controllers/favoriteController';
import { AuthorizationError, NotFoundError } from '../src/app/services/errors';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';

describe('Favorites / Saved Listings Contract (Issue #41)', () => {
  let pglite: PGlite;

  const sellerId = '11111111-1111-1111-1111-111111111111';
  const buyerId = '22222222-2222-2222-2222-222222222222';
  let publishedListingId: string;
  let draftListingId: string;

  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    testDb = drizzle(pglite);

    const migrationFiles = [
      '0000_grey_living_tribunal.sql',
      '0001_add_physical_copies.sql',
      '0002_add_release_cover_art.sql',
      '0003_brainy_scarlet_witch.sql',
    ];

    for (const file of migrationFiles) {
      const sqlContent = fs.readFileSync(path.join(__dirname, '../drizzle', file), 'utf8');
      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await pglite.exec(statement);
      }
    }

    await testDb.insert(profiles).values([
      { id: sellerId, username: 'fav_seller', email: 'fav_seller@example.com' },
      { id: buyerId, username: 'fav_buyer', email: 'fav_buyer@example.com' },
    ]);

    const [release] = await testDb.insert(releases).values({
      title: 'Kind of Blue',
      artist: 'Miles Davis',
    }).returning();

    const [physicalCopy1] = await testDb.insert(physicalCopies).values({
      releaseId: release.id,
      ownerId: sellerId,
      mediaCondition: 'NM',
      sleeveCondition: 'NM',
    }).returning();

    const [physicalCopy2] = await testDb.insert(physicalCopies).values({
      releaseId: release.id,
      ownerId: sellerId,
      mediaCondition: 'VG+',
      sleeveCondition: 'VG+',
    }).returning();

    const [pubListing] = await testDb.insert(listings).values({
      physicalCopyId: physicalCopy1.id,
      sellerId: sellerId,
      price: 3000,
      currency: 'EUR',
      status: 'published',
    }).returning();
    publishedListingId = pubListing.id;

    const [drfListing] = await testDb.insert(listings).values({
      physicalCopyId: physicalCopy2.id,
      sellerId: sellerId,
      price: 2000,
      currency: 'EUR',
      status: 'draft',
    }).returning();
    draftListingId = drfListing.id;
  });

  afterAll(async () => {
    await pglite.close();
  });

  test('should allow authenticated user to add and remove a favorite on a published listing', async () => {
    expect(await isListingFavorited(buyerId, publishedListingId, testDb)).toBe(false);

    const fav = await addFavorite(buyerId, publishedListingId, testDb);
    expect(fav).not.toBeNull();
    expect(fav?.userId).toBe(buyerId);
    expect(fav?.listingId).toBe(publishedListingId);

    expect(await isListingFavorited(buyerId, publishedListingId, testDb)).toBe(true);
    expect(await getFavoriteCount(publishedListingId, testDb)).toBe(1);

    const removed = await removeFavorite(buyerId, publishedListingId, testDb);
    expect(removed).toBe(true);

    expect(await isListingFavorited(buyerId, publishedListingId, testDb)).toBe(false);
    expect(await getFavoriteCount(publishedListingId, testDb)).toBe(0);
  });

  test('should prevent duplicate favorites at repository and service layer', async () => {
    const first = await addFavoriteInRepo(buyerId, publishedListingId, testDb);
    expect(first).not.toBeNull();

    const duplicate = await addFavoriteInRepo(buyerId, publishedListingId, testDb);
    expect(duplicate).toBeNull();

    expect(await getFavoriteCount(publishedListingId, testDb)).toBe(1);

    await removeFavorite(buyerId, publishedListingId, testDb);
  });

  test('regression test: calling addFavorite() twice via service creates exactly one favorite, one activity event, and one notification', async () => {
    clearNotificationListeners();
    const notifications: NotificationEvent[] = [];
    onNotification((evt) => { notifications.push(evt); });

    await removeFavorite(buyerId, publishedListingId, testDb);

    // Call 1: First favorite
    const firstFav = await addFavorite(buyerId, publishedListingId, testDb);
    expect(firstFav).not.toBeNull();

    // Call 2: Duplicate favorite call via service layer
    const secondFav = await addFavorite(buyerId, publishedListingId, testDb);
    expect(secondFav).toBeNull();

    // Assert exactly 1 favorite row in DB
    expect(await getFavoriteCount(publishedListingId, testDb)).toBe(1);

    // Assert exactly 1 activity event created
    const activityEvents = await getRecentActivityEvents({ requestingUserId: buyerId, limit: 50 }, testDb);
    const favActivityEvents = activityEvents.filter(
      (e) => e.eventType === 'favorite.created' && e.listingId === publishedListingId
    );
    expect(favActivityEvents).toHaveLength(1);

    // Assert exactly 1 notification emitted
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('favorite.created');
    expect(notifications[0].actorId).toBe(buyerId);

    await removeFavorite(buyerId, publishedListingId, testDb);
  });

  test('should reject favoriting unpublished (draft) listings', async () => {
    await expect(addFavorite(buyerId, draftListingId, testDb)).rejects.toThrow(AuthorizationError);
    expect(await isListingFavorited(buyerId, draftListingId, testDb)).toBe(false);
  });

  test('should reject favoriting non-existent listing', async () => {
    const nonExistentId = '99999999-9999-9999-9999-999999999999';
    await expect(addFavorite(buyerId, nonExistentId, testDb)).rejects.toThrow(NotFoundError);
  });

  test('should be idempotent when removing a non-existent or already removed favorite', async () => {
    expect(await removeFavorite(buyerId, publishedListingId, testDb)).toBe(true);
    expect(await removeFavorite(buyerId, publishedListingId, testDb)).toBe(true);
  });

  describe('Favorite HTTP Endpoint Boundaries', () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));

    app.use((req, _res, next) => {
      if (req.headers['x-test-user-id']) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).user = { id: req.headers['x-test-user-id'] as string };
      }
      next();
    });

    app.post('/listings/:id/favorite', postFavoriteListing);
    app.post('/listings/:id/unfavorite', postUnfavoriteListing);

    test('POST /listings/:id/favorite should redirect unauthenticated request to /auth/login', async () => {
      const res = await request(app).post(`/listings/${publishedListingId}/favorite`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/auth/login');
    });

    test('POST /listings/:id/favorite should favorite listing and redirect when authenticated', async () => {
      const res = await request(app)
        .post(`/listings/${publishedListingId}/favorite`)
        .set('x-test-user-id', buyerId);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/listings/${publishedListingId}`);
    });

    test('POST /listings/:id/unfavorite should unfavorite listing idempotently and redirect when authenticated', async () => {
      const res = await request(app)
        .post(`/listings/${publishedListingId}/unfavorite`)
        .set('x-test-user-id', buyerId);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/listings/${publishedListingId}`);
    });
  });
});
