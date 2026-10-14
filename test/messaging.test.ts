import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import request from 'supertest';
import { createApp } from '../src/app';
import * as dbModule from '../src/db';
import { listings, physicalCopies, profiles, releases } from '../src/db/schema';
import { conversations } from '../src/db/schema/conversations';
import { messages } from '../src/db/schema/messages';
import { clearNotificationListeners, onNotification, NotificationEvent } from '../src/app/services/notificationHooks';
import { messagingService } from '../src/app/services/messagingService';
import fs from 'fs';
import path from 'path';

describe('Phase 7 Private Communication — Messaging Integration', () => {
  let pg: PGlite;
  let db: any;
  let getDbSpy: jest.SpyInstance;

  const buyerId = '11111111-1111-4111-8111-111111111111';
  const sellerId = '22222222-2222-4222-8222-222222222222';
  const thirdUserId = '33333333-3333-4333-8333-333333333333';

  const releaseId = '44444444-4444-4444-8444-444444444444';
  const copyId = '55555555-5555-4555-8555-555555555555';
  const publishedListingId = '66666666-6666-4666-8666-666666666666';
  const draftListingId = '77777777-7777-4777-8777-777777777777';

  beforeAll(async () => {
    pg = new PGlite();

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

    // Seed test profiles
    await db.insert(profiles).values([
      { id: buyerId, username: 'buyer_user', displayName: 'Buyer User' },
      { id: sellerId, username: 'seller_user', displayName: 'Seller User' },
      { id: thirdUserId, username: 'third_user', displayName: 'Third User' },
    ]);

    // Seed test release and physical copy
    await db.insert(releases).values({
      id: releaseId,
      artist: 'Pink Floyd',
      title: 'The Dark Side of the Moon',
      label: 'Harvest',
      releaseYear: 1973,
    });

    await db.insert(physicalCopies).values({
      id: copyId,
      releaseId,
      ownerId: sellerId,
      mediaCondition: 'VG+',
      sleeveCondition: 'VG+',
    });

    // Seed published & draft listings
    await db.insert(listings).values([
      {
        id: publishedListingId,
        physicalCopyId: copyId,
        sellerId,
        price: 4500,
        currency: 'EUR',
        status: 'published',
      },
      {
        id: draftListingId,
        physicalCopyId: copyId,
        sellerId,
        price: 4000,
        currency: 'EUR',
        status: 'draft',
      },
    ]);
  });

  afterAll(async () => {
    getDbSpy.mockRestore();
    if (pg) {
      await pg.close();
    }
  });

  beforeEach(() => {
    clearNotificationListeners();
    delete process.env.MESSAGING_ENABLED;
  });

  describe('Database Triggers & Guard Rules', () => {
    test('rejects self-conversation via database trigger', async () => {
      await expect(
        db.insert(conversations).values({
          listingId: publishedListingId,
          buyerId: sellerId,
        })
      ).rejects.toThrow();
    });

    test('rejects conversation on draft listing via database trigger', async () => {
      await expect(
        db.insert(conversations).values({
          listingId: draftListingId,
          buyerId: buyerId,
        })
      ).rejects.toThrow();
    });

    test('rejects message from a non-participant via database trigger', async () => {
      const [conv] = await db
        .insert(conversations)
        .values({
          listingId: publishedListingId,
          buyerId,
        })
        .returning();

      await expect(
        db.insert(messages).values({
          conversationId: conv.id,
          senderId: thirdUserId,
          body: 'Uninvited message',
        })
      ).rejects.toThrow();
    });
  });

  describe('HTTP Route Scoping & Authorization Controls', () => {
    test('hides messaging routes when MESSAGING_ENABLED is false', async () => {
      process.env.MESSAGING_ENABLED = 'false';

      const app = createApp();
      const res = await request(app).get('/messages');

      expect(res.status).toBe(404);
    });

    test('redirects unauthenticated requests when MESSAGING_ENABLED is true', async () => {
      process.env.MESSAGING_ENABLED = 'true';

      const app = createApp();
      const res = await request(app).get('/messages');

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/auth/login');
    });
  });

  describe('Service & Notification Hook Contracts', () => {
    test('emits message.created event without body content to recipient only', async () => {
      const receivedEvents: NotificationEvent[] = [];
      onNotification((event) => {
        receivedEvents.push(event);
      });

      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);
      const msg = await messagingService.sendMessage(conv.id, buyerId, 'Hello seller!');

      expect(receivedEvents.length).toBe(1);
      const ev = receivedEvents[0];
      expect(ev.type).toBe('message.created');
      expect(ev.actorId).toBe(buyerId);
      expect(ev.recipientId).toBe(sellerId);
      expect(ev.conversationId).toBe(conv.id);
      expect(ev.messageId).toBe(msg.id);
      expect((ev as any).body).toBeUndefined();
    });

    test('restores archived thread to inbox upon new message', async () => {
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      // Seller archives conversation
      await messagingService.archiveConversation(conv.id, sellerId);

      let sellerInbox = await messagingService.getInboxForUser(sellerId);
      expect(sellerInbox.some((item: any) => item.conversation.id === conv.id)).toBe(false);

      // Buyer sends a new message
      await messagingService.sendMessage(conv.id, buyerId, 'New message unarchives seller thread!');

      sellerInbox = await messagingService.getInboxForUser(sellerId);
      expect(sellerInbox.some((item: any) => item.conversation.id === conv.id)).toBe(true);
    });
  });
});
