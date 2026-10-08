import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import {
  clearNotificationListeners,
  emitNotificationEvent,
  getNotificationListenerCount,
  NotificationEvent,
  onNotification,
} from '../src/app/services/notificationHooks';
import { addFavorite } from '../src/app/services/favoriteService';
import { addComment } from '../src/app/services/commentService';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';

describe('Notification Hooks Contract (Issue #41)', () => {
  let pglite: PGlite;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    db = drizzle(pglite);

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
  });

  afterAll(async () => {
    await pglite.close();
  });

  beforeEach(() => {
    clearNotificationListeners();
  });

  test('should register listener and receive emitted notification events', async () => {
    const received: NotificationEvent[] = [];
    const unsubscribe = onNotification((evt) => {
      received.push(evt);
    });

    expect(getNotificationListenerCount()).toBe(1);

    const testEvent: NotificationEvent = {
      type: 'favorite.created',
      actorId: 'user-1',
      recipientId: 'user-2',
      listingId: 'listing-1',
      createdAt: new Date(),
    };

    await emitNotificationEvent(testEvent);

    expect(received).toHaveLength(1);
    expect(received[0].actorId).toBe('user-1');
    expect(received[0].recipientId).toBe('user-2');

    unsubscribe();
    expect(getNotificationListenerCount()).toBe(0);
  });

  test('should NOT emit notification when actor is the recipient (self-notification protection)', async () => {
    const received: NotificationEvent[] = [];
    onNotification((evt) => {
      received.push(evt);
    });

    await emitNotificationEvent({
      type: 'favorite.created',
      actorId: 'user-seller-1',
      recipientId: 'user-seller-1',
      listingId: 'listing-1',
      createdAt: new Date(),
    });

    expect(received).toHaveLength(0);
  });

  test('should trigger notification hook when favoriting another user listing, but NOT on self-favorite', async () => {
    const sellerId = '44444444-4444-4444-4444-444444444444';
    const buyerId = '55555555-5555-5555-5555-555555555555';

    await db.insert(profiles).values([
      { id: sellerId, username: 'seller1', email: 'seller1@example.com' },
      { id: buyerId, username: 'buyer1', email: 'buyer1@example.com' },
    ]);

    const [release] = await db.insert(releases).values({
      title: 'Dark Side of the Moon',
      artist: 'Pink Floyd',
    }).returning();

    const [physicalCopy] = await db.insert(physicalCopies).values({
      releaseId: release.id,
      ownerId: sellerId,
      mediaCondition: 'NM',
      sleeveCondition: 'NM',
    }).returning();

    const [listing] = await db.insert(listings).values({
      physicalCopyId: physicalCopy.id,
      sellerId: sellerId,
      price: 3500,
      currency: 'EUR',
      status: 'published',
    }).returning();

    const notifications: NotificationEvent[] = [];
    onNotification((evt) => { notifications.push(evt); });

    await addFavorite(buyerId, listing.id, db);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('favorite.created');
    expect(notifications[0].actorId).toBe(buyerId);
    expect(notifications[0].recipientId).toBe(sellerId);
    expect(notifications[0].listingId).toBe(listing.id);

    notifications.length = 0;
    await addFavorite(sellerId, listing.id, db);
    expect(notifications).toHaveLength(0);
  });

  test('should trigger notification hook when posting comment on another user listing, but NOT on self-comment', async () => {
    const sellerId = '66666666-6666-6666-6666-666666666666';
    const commenterId = '77777777-7777-7777-7777-777777777777';

    await db.insert(profiles).values([
      { id: sellerId, username: 'seller2', email: 'seller2@example.com' },
      { id: commenterId, username: 'commenter1', email: 'commenter1@example.com' },
    ]);

    const [release] = await db.insert(releases).values({
      title: 'Abbey Road',
      artist: 'The Beatles',
    }).returning();

    const [physicalCopy] = await db.insert(physicalCopies).values({
      releaseId: release.id,
      ownerId: sellerId,
      mediaCondition: 'VG+',
      sleeveCondition: 'VG+',
    }).returning();

    const [listing] = await db.insert(listings).values({
      physicalCopyId: physicalCopy.id,
      sellerId: sellerId,
      price: 2500,
      currency: 'EUR',
      status: 'published',
    }).returning();

    const notifications: NotificationEvent[] = [];
    onNotification((evt) => { notifications.push(evt); });

    await addComment(listing.id, commenterId, 'Is this a original press?', db);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('comment.created');
    expect(notifications[0].actorId).toBe(commenterId);
    expect(notifications[0].recipientId).toBe(sellerId);
    expect(notifications[0].listingId).toBe(listing.id);
    expect(notifications[0].commentId).toBeDefined();

    notifications.length = 0;
    await addComment(listing.id, sellerId, 'Yes, 1st UK pressing!', db);
    expect(notifications).toHaveLength(0);
  });
});
