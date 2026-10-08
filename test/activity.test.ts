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
  getRecentActivityFeed,
  recordListingPublishedEvent,
  recordCommentCreatedEvent,
} from '../src/app/services/activityService';
import { addFavorite, removeFavorite } from '../src/app/services/favoriteService';
import { getActivityPage } from '../src/app/controllers/activityController';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { comments } from '../src/db/schema/comments';
import { eq } from 'drizzle-orm';

describe('Community Activity Surface Contract (Issue #41)', () => {
  let pglite: PGlite;

  const userAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  let publishedListing1Id: string;
  let draftListingId: string;
  let comment1Id: string;

  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    testDb = drizzle(pglite);

    const migrationFiles = [
      '0000_grey_living_tribunal.sql',
      '0001_add_physical_copies.sql',
      '0002_add_release_cover_art.sql',
      '0003_brainy_scarlet_witch.sql',
      '0004_mighty_spacker_dave.sql',
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
      { id: userAId, username: 'user_a', email: 'user_a@example.com' },
      { id: userBId, username: 'user_b', email: 'user_b@example.com' },
    ]);

    const [release] = await testDb.insert(releases).values({
      title: 'Rumours',
      artist: 'Fleetwood Mac',
    }).returning();

    const [physicalCopy1] = await testDb.insert(physicalCopies).values({
      releaseId: release.id,
      ownerId: userAId,
      mediaCondition: 'NM',
      sleeveCondition: 'NM',
    }).returning();

    const [physicalCopy2] = await testDb.insert(physicalCopies).values({
      releaseId: release.id,
      ownerId: userAId,
      mediaCondition: 'VG',
      sleeveCondition: 'VG',
    }).returning();

    const [pubListing] = await testDb.insert(listings).values({
      physicalCopyId: physicalCopy1.id,
      sellerId: userAId,
      price: 2800,
      currency: 'EUR',
      status: 'published',
    }).returning();
    publishedListing1Id = pubListing.id;
    await recordListingPublishedEvent(userAId, publishedListing1Id, testDb);

    const [drfListing] = await testDb.insert(listings).values({
      physicalCopyId: physicalCopy2.id,
      sellerId: userAId,
      price: 1500,
      currency: 'EUR',
      status: 'draft',
    }).returning();
    draftListingId = drfListing.id;

    const [cmt] = await testDb.insert(comments).values({
      listingId: publishedListing1Id,
      authorId: userBId,
      content: 'Classic pressing!',
    }).returning();
    comment1Id = cmt.id;
    await recordCommentCreatedEvent(userBId, publishedListing1Id, comment1Id, testDb);

    await addFavorite(userBId, publishedListing1Id, testDb);
  });

  afterAll(async () => {
    await pglite.close();
  });

  test('public feed (unauthenticated visitor) should ONLY see allowed public events and NEVER private favorites', async () => {
    const feed = await getRecentActivityFeed(undefined, 50, testDb);

    const eventTypes = feed.map((e) => e.eventType);
    expect(eventTypes).toContain('listing.published');
    expect(eventTypes).toContain('comment.created');
    expect(eventTypes).not.toContain('favorite.created');

    for (const item of feed) {
      expect(item.isPrivate).toBe(false);
    }
  });

  test('authenticated user B should see public events AND their OWN private favorite activity', async () => {
    const feed = await getRecentActivityFeed(userBId, 50, testDb);

    const eventTypes = feed.map((e) => e.eventType);
    expect(eventTypes).toContain('listing.published');
    expect(eventTypes).toContain('comment.created');
    expect(eventTypes).toContain('favorite.created');

    const favEvent = feed.find((e) => e.eventType === 'favorite.created');
    expect(favEvent).toBeDefined();
    expect(favEvent?.actorUsername).toBe('user_b');
    expect(favEvent?.isPrivate).toBe(true);
  });

  test('authenticated user A should NOT see user B private favorite activity', async () => {
    const feed = await getRecentActivityFeed(userAId, 50, testDb);

    const eventTypes = feed.map((e) => e.eventType);
    expect(eventTypes).not.toContain('favorite.created');
  });

  test('unfavoriting a listing should remove its private favorite activity event', async () => {
    await removeFavorite(userBId, publishedListing1Id, testDb);

    const feed = await getRecentActivityFeed(userBId, 50, testDb);
    const eventTypes = feed.map((e) => e.eventType);
    expect(eventTypes).not.toContain('favorite.created');

    await addFavorite(userBId, publishedListing1Id, testDb);
  });

  test('activity feed excludes unpublished/draft or deleted source content', async () => {
    await recordListingPublishedEvent(userAId, draftListingId, testDb);

    const feed = await getRecentActivityFeed(userBId, 50, testDb);
    for (const item of feed) {
      expect(item.listingId).not.toBe(draftListingId);
    }

    await testDb.update(listings).set({ status: 'draft' }).where(eq(listings.id, publishedListing1Id));

    const feedWhileDraft = await getRecentActivityFeed(userBId, 50, testDb);
    expect(feedWhileDraft).toHaveLength(0);

    await testDb.update(listings).set({ status: 'published' }).where(eq(listings.id, publishedListing1Id));
  });

  test('activity feed is bounded and deterministic', async () => {
    const feedBounded = await getRecentActivityFeed(userBId, 2, testDb);
    expect(feedBounded.length).toBeLessThanOrEqual(2);
  });

  describe('Activity Page HTTP Controller Boundaries (GET /activity)', () => {
    const app = express();
    app.set('views', path.join(__dirname, '../views'));
    app.set('view engine', 'ejs');

    app.get('/activity', getActivityPage);

    test('GET /activity should render 200 OK HTML activity stream', async () => {
      const res = await request(app).get('/activity');
      expect(res.status).toBe(200);
      expect(res.text).toContain('COMMUNITY ACTIVITY');
      expect(res.text).toContain('Rumours');
      expect(res.text).toContain('Fleetwood Mac');
    });
  });
});
