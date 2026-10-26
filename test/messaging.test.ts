import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import request from 'supertest';
import { createApp } from '../src/app';
import * as dbModule from '../src/db';
import * as authService from '../src/app/services/authService';
import { listings, physicalCopies, profiles, releases } from '../src/db/schema';
import { conversations } from '../src/db/schema/conversations';
import { messages } from '../src/db/schema/messages';
import { clearNotificationListeners, onNotification, NotificationEvent } from '../src/app/services/notificationHooks';
import { config } from '../src/config/env';
import { messagingService } from '../src/app/services/messagingService';
import { savedPeopleService } from '../src/app/services/savedPeopleService';
import fs from 'fs';
import path from 'path';

describe('Phase 7 Private Communication — Messaging Integration', () => {
  let pg: PGlite;
  let db: any;
  let getDbSpy: jest.SpyInstance;
  let getUserFromTokenSpy: jest.SpyInstance;

  const buyerId = '11111111-1111-4111-8111-111111111111';
  const sellerId = '22222222-2222-4222-8222-222222222222';
  const thirdUserId = '33333333-3333-4333-8333-333333333333';

  const releaseId = '44444444-4444-4444-8444-444444444444';
  const copyId = '55555555-5555-4555-8555-555555555555';
  const publishedListingId = '66666666-6666-4666-8666-666666666666';
  const draftListingId = '77777777-7777-4777-8777-777777777777';

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec('CREATE ROLE supabase_auth_admin NOLOGIN;');

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
      if (token === 'buyer-token') return { id: buyerId } as any;
      if (token === 'seller-token') return { id: sellerId } as any;
      if (token === 'third-token') return { id: thirdUserId } as any;
      return null;
    });

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
    getUserFromTokenSpy.mockRestore();
    if (pg) {
      await pg.close();
    }
  });

  beforeEach(() => {
    clearNotificationListeners();
  });

  describe('Database Triggers & Guard Rules', () => {
    test('rejects self-conversation via database trigger', async () => {
      await expect(
        db.insert(conversations).values({
          conversationType: 'listing',
          listingId: publishedListingId,
          participantAId: sellerId,
          participantBId: sellerId,
        })
      ).rejects.toThrow();
    });

    test('rejects conversation on draft listing via database trigger', async () => {
      await expect(
        db.insert(conversations).values({
          conversationType: 'listing',
          listingId: draftListingId,
          participantAId: buyerId,
          participantBId: sellerId,
        })
      ).rejects.toThrow();
    });

    test('rejects message from a non-participant via database trigger', async () => {
      const [conv] = await db
        .insert(conversations)
        .values({
          conversationType: 'listing',
          listingId: publishedListingId,
          participantAId: buyerId,
          participantBId: sellerId,
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
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = false;

      const app = createApp();
      const res = await request(app).get('/messages');

      expect(res.status).toBe(404);

      (config as any).MESSAGING_ENABLED = originalFlag;
    });

    test('redirects unauthenticated requests when MESSAGING_ENABLED is true', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;

      const app = createApp();
      const res = await request(app).get('/messages');

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/auth/login');

      (config as any).MESSAGING_ENABLED = originalFlag;
    });

    test('disabled feature guard performs 0 queries on conversations/messages tables', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = false;
      const selectSpy = jest.spyOn(db, 'select');

      const app = createApp();
      await request(app).get('/messages');
      await request(app).get(`/messages/00000000-0000-0000-0000-000000000000`);
      await request(app).get('/messages/widget/unread-count');
      await request(app).get('/messages/widget/data');
      await request(app).get('/messages/widget/00000000-0000-0000-0000-000000000000');
      await request(app).post('/messages/profile/22222222-2222-4222-8222-222222222222').set('Origin', config.APP_BASE_URL);

      expect(selectSpy).not.toHaveBeenCalled();
      selectSpy.mockRestore();
      (config as any).MESSAGING_ENABLED = originalFlag;
    });

    test('requires CSRF same-origin headers for POST mutation routes when authenticated', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;

      const app = createApp();
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      // Sending message without Origin or Referer fails with 403 when authenticated
      const res1 = await request(app)
        .post(`/messages/${conv.id}/send`)
        .set('Cookie', [`sb-access-token=buyer-token`])
        .send({ body: 'Test' });

      expect(res1.status).toBe(403);

      // Sending message with foreign Origin fails with 403
      const res2 = await request(app)
        .post(`/messages/${conv.id}/send`)
        .set('Cookie', [`sb-access-token=buyer-token`])
        .set('Origin', 'http://attacker.com')
        .send({ body: 'Test' });

      expect(res2.status).toBe(403);

      // Valid same-origin request succeeds with redirect
      const res3 = await request(app)
        .post(`/messages/${conv.id}/send`)
        .set('Cookie', [`sb-access-token=buyer-token`])
        .set('Origin', config.APP_BASE_URL)
        .send({ body: 'Valid message' });

      expect(res3.status).toBe(302);
      expect(res3.header.location).toBe(`/messages/${conv.id}`);

      (config as any).MESSAGING_ENABLED = originalFlag;
    });

    test('returns non-enumerating 404 for third party user requesting another user conversation ID via HTTP route', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;

      const app = createApp();
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      // Third party GET receives 404
      const resGet = await request(app)
        .get(`/messages/${conv.id}`)
        .set('Cookie', [`sb-access-token=third-token`]);

      expect(resGet.status).toBe(404);

      // Third party POST send receives 404
      const resPost = await request(app)
        .post(`/messages/${conv.id}/send`)
        .set('Cookie', [`sb-access-token=third-token`])
        .set('Origin', config.APP_BASE_URL)
        .send({ body: 'Attacker payload' });

      expect(resPost.status).toBe(404);

      (config as any).MESSAGING_ENABLED = originalFlag;
    });

    test('validates body type as string in send message controller and asserts no DB insertion on failure', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;

      const app = createApp();
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      const countBeforeRows = await db.select().from(messages);
      const countBefore = countBeforeRows.length;

      // Passing non-string JSON body produces 400 Bad Request
      const res1 = await request(app)
        .post(`/messages/${conv.id}/send`)
        .set('Cookie', [`sb-access-token=buyer-token`])
        .set('Origin', config.APP_BASE_URL)
        .send({ body: { invalid: 'object' } });

      expect(res1.status).toBe(400);

      // Passing array body produces 400 Bad Request
      const res2 = await request(app)
        .post(`/messages/${conv.id}/send`)
        .set('Cookie', [`sb-access-token=buyer-token`])
        .set('Origin', config.APP_BASE_URL)
        .send({ body: ['invalid', 'array'] });

      expect(res2.status).toBe(400);

      const countAfterRows = await db.select().from(messages);
      expect(countAfterRows.length).toBe(countBefore);

      (config as any).MESSAGING_ENABLED = originalFlag;
    });
  });


    test('serves widget inbox, truthful participant-scoped unread count, and conversation JSON', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;
      try {
        const app = createApp();
        const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);
        await messagingService.markAsRead(conv.id, buyerId, conv.lastMessageSeq);
        await messagingService.markAsRead(conv.id, sellerId, conv.lastMessageSeq);
        await new Promise((resolve) => setTimeout(resolve, 10));
        await messagingService.sendMessage(conv.id, buyerId, 'A widget-only unread message');
        await new Promise((resolve) => setTimeout(resolve, 10));

        const unread = await request(app)
          .get('/messages/widget/unread-count')
          .set('Cookie', ['sb-access-token=seller-token'])
          .set('Accept', 'application/json');
        expect(unread.status).toBe(200);
        expect(unread.body.unreadCount).toBeGreaterThanOrEqual(1);

        const inbox = await request(app)
          .get('/messages/widget/data')
          .set('Cookie', ['sb-access-token=seller-token'])
          .set('Accept', 'application/json');
        expect(inbox.status).toBe(200);
        expect(inbox.headers['cache-control']).toContain('no-store');
        const item = inbox.body.conversations.find((entry: { id: string }) => entry.id === conv.id);
        expect(item).toBeDefined();
        expect(item.releaseArtist).toBe('Pink Floyd');
        expect(item.releaseTitle).toBe('The Dark Side of the Moon');
        expect(item.unreadCount).toBeGreaterThanOrEqual(1);
        expect(item.lastMessage).toBe('A widget-only unread message');

        const detail = await request(app)
          .get(`/messages/widget/${conv.id}`)
          .set('Cookie', ['sb-access-token=seller-token'])
          .set('Accept', 'application/json');
        expect(detail.status).toBe(200);
        expect(detail.body.id).toBe(conv.id);
        expect(detail.body.unreadCount).toBeGreaterThanOrEqual(1);
        expect(detail.body.messages.some((message: { body: string; isOwnMessage: boolean }) =>
          message.body === 'A widget-only unread message' && message.isOwnMessage === false
        )).toBe(true);

        const outsider = await request(app)
          .get(`/messages/widget/${conv.id}`)
          .set('Cookie', ['sb-access-token=third-token'])
          .set('Accept', 'application/json');
        expect(outsider.status).toBe(404);

        const sellerSnapshot = await messagingService.getConversationDetail(conv.id, sellerId);
        const readThroughSeq = sellerSnapshot.messages.reduce((maximum, message) => Math.max(maximum, message.messageSeq), 0);
        await messagingService.markAsRead(conv.id, sellerId, readThroughSeq);
        await new Promise((resolve) => setTimeout(resolve, 10));
        const cleared = await request(app)
          .get('/messages/widget/unread-count')
          .set('Cookie', ['sb-access-token=seller-token'])
          .set('Accept', 'application/json');
        expect(cleared.status).toBe(200);
        expect(cleared.body.unreadCount).toBe(0);
      } finally {
        (config as any).MESSAGING_ENABLED = originalFlag;
      }
    });

    test('supports widget JSON send while preserving full-page form redirects', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;
      try {
        const app = createApp();
        const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);
        const res = await request(app)
          .post(`/messages/${conv.id}/send`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Origin', config.APP_BASE_URL)
          .set('Accept', 'application/json')
          .set('X-Messaging-Widget', '1')
          .send({ body: 'Sent from the floating widget' });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('ok');
        expect(res.body.message.body).toBe('Sent from the floating widget');
        expect(res.body.message.isOwnMessage).toBe(true);
        expect(res.headers['cache-control']).toContain('no-store');
      } finally {
        (config as any).MESSAGING_ENABLED = originalFlag;
      }
    });

    test('serves savedPeople in widget inbox data and supports widget direct chat initialization', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;
      try {
        const app = createApp();
        await savedPeopleService.savePerson(buyerId, sellerId);

        const inbox = await request(app)
          .get('/messages/widget/data')
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Accept', 'application/json');
        expect(inbox.status).toBe(200);
        expect(Array.isArray(inbox.body.savedPeople)).toBe(true);
        const savedSeller = inbox.body.savedPeople.find((p: { id: string }) => p.id === sellerId);
        expect(savedSeller).toBeDefined();
        expect(savedSeller.username).toBe('seller_user');

        const directChat = await request(app)
          .post(`/messages/profile/${sellerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Origin', config.APP_BASE_URL)
          .set('Accept', 'application/json')
          .set('X-Messaging-Widget', '1');
        expect(directChat.status).toBe(200);
        expect(directChat.body.id).toBeDefined();
        expect(directChat.body.conversationType).toBe('direct');
      } finally {
        await savedPeopleService.removePerson(buyerId, sellerId).catch(() => {});
        (config as any).MESSAGING_ENABLED = originalFlag;
      }
    });
  describe('Service & Scoping Boundaries', () => {
    test('concurrent conversation creation attempts safely reuse same thread', async () => {
      const [c1, c2] = await Promise.all([
        messagingService.getOrCreateConversation(publishedListingId, buyerId),
        messagingService.getOrCreateConversation(publishedListingId, buyerId),
      ]);
      expect(c1.id).toBe(c2.id);
    });

    test('complete buyer/seller conversation flow (detail, send, read, archive)', async () => {
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      // Buyer sends message
      const msg1 = await messagingService.sendMessage(conv.id, buyerId, 'Hello, is this available?');
      expect(msg1.body).toBe('Hello, is this available?');

      // Seller views detail
      const sellerDetail = await messagingService.getConversationDetail(conv.id, sellerId);
      expect(sellerDetail.userRole).toBe('seller');
      expect(sellerDetail.messages.length).toBeGreaterThanOrEqual(1);

      // Seller replies
      const msg2 = await messagingService.sendMessage(conv.id, sellerId, 'Yes, still available!');
      expect(msg2.body).toBe('Yes, still available!');

      // Buyer marks read
      await messagingService.markAsRead(conv.id, buyerId, msg2.messageSeq);

      // Seller archives
      await messagingService.archiveConversation(conv.id, sellerId);
      const sellerInbox = await messagingService.getInboxForUser(sellerId);
      expect(sellerInbox.some((item) => item.conversation.id === conv.id)).toBe(false);
    });

    test('reopening an archived conversation unarchives it for the buyer', async () => {
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      // Buyer archives conversation
      await messagingService.archiveConversation(conv.id, buyerId);

      let buyerInbox = await messagingService.getInboxForUser(buyerId);
      expect(buyerInbox.some((item) => item.conversation.id === conv.id)).toBe(false);

      // Buyer reopens conversation from listing detail
      const reopened = await messagingService.getOrCreateConversation(publishedListingId, buyerId);
      expect(reopened.id).toBe(conv.id);

      buyerInbox = await messagingService.getInboxForUser(buyerId);
      expect(buyerInbox.some((item) => item.conversation.id === conv.id)).toBe(true);
    });

    test('third party user receives non-enumerating 404 when accessing another user conversation ID', async () => {
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      await expect(messagingService.getConversationDetail(conv.id, thirdUserId)).rejects.toThrow(
        /Conversation not found/
      );
      await expect(
        messagingService.sendMessage(conv.id, thirdUserId, 'Sneaky message')
      ).rejects.toThrow(/Conversation not found/);
      await expect(
        messagingService.markAsRead(conv.id, thirdUserId, 0)
      ).rejects.toThrow(/Conversation not found/);
      await expect(
        messagingService.archiveConversation(conv.id, thirdUserId)
      ).rejects.toThrow(/Conversation not found/);
    });

    test('validates message body length boundaries', async () => {
      const conv = await messagingService.getOrCreateConversation(publishedListingId, buyerId);

      await expect(messagingService.sendMessage(conv.id, buyerId, '')).rejects.toThrow(
        /Message body cannot be empty/
      );
      await expect(messagingService.sendMessage(conv.id, buyerId, '   ')).rejects.toThrow(
        /Message body cannot be empty/
      );

      const hugeBody = 'a'.repeat(4001);
      await expect(messagingService.sendMessage(conv.id, buyerId, hugeBody)).rejects.toThrow(
        /Message body cannot exceed 4,000 characters/
      );

      const maxValidBody = 'a'.repeat(4000);
      const validMsg = await messagingService.sendMessage(conv.id, buyerId, maxValidBody);
      expect(validMsg.body.length).toBe(4000);
    });
  });


  describe('Direct conversation contracts', () => {
    test('concurrent starts from either participant converge on a single ordered pair', async () => {
      const [fromBuyer, fromSeller] = await Promise.all([
        messagingService.getOrCreateDirectConversation(sellerId, buyerId),
        messagingService.getOrCreateDirectConversation(buyerId, sellerId),
      ]);

      expect(fromBuyer.id).toBe(fromSeller.id);
      expect(fromBuyer.conversationType).toBe('direct');
      expect(fromBuyer.listingId).toBeNull();
      expect(fromBuyer.participantAId).toBe(buyerId);
      expect(fromBuyer.participantBId).toBe(sellerId);
      const rows = await db.select().from(conversations);
      expect(rows.filter((row: any) =>
        row.conversationType === 'direct' &&
        row.participantAId === buyerId &&
        row.participantBId === sellerId
      )).toHaveLength(1);
    });

    test('uses immutable sequence numbers across equal timestamps and emits listing-free direct events', async () => {
      const conversation = await messagingService.getOrCreateDirectConversation(sellerId, buyerId);
      const tieTime = new Date('2026-01-02T03:04:05.000Z');

      await db.insert(messages).values([
        { conversationId: conversation.id, senderId: buyerId, body: 'First tied message', createdAt: tieTime },
        { conversationId: conversation.id, senderId: buyerId, body: 'Second tied message', createdAt: tieTime },
      ]);
      await messagingService.markAsRead(conversation.id, sellerId, 2);

      await db.insert(messages).values({
        conversationId: conversation.id,
        senderId: buyerId,
        body: 'Third tied message after read',
        createdAt: tieTime,
      });

      const detail = await messagingService.getConversationDetail(conversation.id, sellerId);
      expect(detail.messages.map((message) => message.messageSeq)).toEqual([1, 2, 3]);
      let summary = (await messagingService.getInboxForUser(sellerId))
        .find((item) => item.conversation.id === conversation.id);
      expect(summary?.listing).toBeNull();
      expect(summary?.release).toBeNull();
      expect(summary?.unreadCount).toBe(1);

      const receivedEvents: NotificationEvent[] = [];
      onNotification((event) => { receivedEvents.push(event); });
      await messagingService.sendMessage(conversation.id, buyerId, 'Direct event has no listing context');
      expect(receivedEvents).toHaveLength(1);
      const event = receivedEvents[0];
      expect(event.type).toBe('message.created');
      if (event.type !== 'message.created') throw new Error('Expected a message-created event');
      expect(event.conversationType).toBe('direct');
      expect(event.recipientId).toBe(sellerId);
      expect(event).not.toHaveProperty('listingId');
      expect(event).not.toHaveProperty('body');

      summary = (await messagingService.getInboxForUser(sellerId))
        .find((item) => item.conversation.id === conversation.id);
      expect(summary?.unreadCount).toBe(2);

      await messagingService.archiveConversation(conversation.id, sellerId);
      expect((await messagingService.getInboxForUser(sellerId))
        .some((item) => item.conversation.id === conversation.id)).toBe(false);
      await messagingService.sendMessage(conversation.id, buyerId, 'Incoming message reopens the recipient thread');
      expect((await messagingService.getInboxForUser(sellerId))
        .some((item) => item.conversation.id === conversation.id)).toBe(true);

      await expect(messagingService.getConversationDetail(conversation.id, thirdUserId))
        .rejects.toThrow(/Conversation not found/);
    });

    test('profile Message action is shown only to another signed-in user while messaging is enabled', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;
      try {
        const app = createApp();
        const otherProfile = await request(app)
          .get('/profiles/seller_user')
          .set('Cookie', ['sb-access-token=buyer-token']);
        expect(otherProfile.status).toBe(200);
        expect(otherProfile.text).toContain(`action="/messages/profile/${sellerId}"`);

        const ownProfile = await request(app)
          .get('/profiles/seller_user')
          .set('Cookie', ['sb-access-token=seller-token']);
        expect(ownProfile.status).toBe(200);
        expect(ownProfile.text).not.toContain(`action="/messages/profile/${sellerId}"`);

        (config as any).MESSAGING_ENABLED = false;
        const hiddenFeature = await request(app)
          .get('/profiles/seller_user')
          .set('Cookie', ['sb-access-token=buyer-token']);
        expect(hiddenFeature.status).toBe(200);
        expect(hiddenFeature.text).not.toContain(`action="/messages/profile/${sellerId}"`);
      } finally {
        (config as any).MESSAGING_ENABLED = originalFlag;
      }
    });

    test('profile route creates a private thread with same-origin protection', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;
      try {
        const app = createApp();
        const forbidden = await request(app)
          .post(`/messages/profile/${sellerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .send({});
        expect(forbidden.status).toBe(403);

        const started = await request(app)
          .post(`/messages/profile/${sellerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Origin', config.APP_BASE_URL)
          .send({});
        expect(started.status).toBe(302);
        expect(started.headers.location).toMatch(/^\/messages\/[0-9a-f-]+$/);

        const self = await request(app)
          .post(`/messages/profile/${buyerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Origin', config.APP_BASE_URL)
          .send({});
        expect(self.status).toBe(400);
      } finally {
        (config as any).MESSAGING_ENABLED = originalFlag;
      }
    });
  });


  describe('Saved People privacy and idempotency', () => {
    test('saving/removing is idempotent and visible only to the owner without changing conversation state', async () => {
      const direct = await messagingService.getOrCreateDirectConversation(sellerId, buyerId);
      await messagingService.archiveConversation(direct.id, buyerId);
      const beforeRows = await db.select().from(conversations);
      const before = beforeRows.find((row: any) => row.id === direct.id);
      expect(before).toBeDefined();

      await savedPeopleService.savePerson(buyerId, sellerId);
      await savedPeopleService.savePerson(buyerId, sellerId);
      expect(await savedPeopleService.isSavedPerson(buyerId, sellerId)).toBe(true);
      expect(await savedPeopleService.isSavedPerson(sellerId, buyerId)).toBe(false);
      const buyerList = await savedPeopleService.getSavedPeopleForUser(buyerId);
      expect(buyerList.filter(person => person.id === sellerId)).toHaveLength(1);
      const sellerList = await savedPeopleService.getSavedPeopleForUser(sellerId);
      expect(sellerList.some(person => person.id === buyerId)).toBe(false);

      const duringRows = await db.select().from(conversations);
      const during = duringRows.find((row: any) => row.id === direct.id);
      expect(during?.participantAReadSeq).toBe(before?.participantAReadSeq);
      expect(during?.participantBReadSeq).toBe(before?.participantBReadSeq);
      expect(during?.participantAArchivedAt).toEqual(before?.participantAArchivedAt);
      expect(during?.participantBArchivedAt).toEqual(before?.participantBArchivedAt);
      expect(during?.lastMessageSeq).toBe(before?.lastMessageSeq);

      await savedPeopleService.removePerson(buyerId, sellerId);
      await savedPeopleService.removePerson(buyerId, sellerId);
      expect(await savedPeopleService.isSavedPerson(buyerId, sellerId)).toBe(false);
      const afterRows = await db.select().from(conversations);
      const after = afterRows.find((row: any) => row.id === direct.id);
      expect(after?.participantAReadSeq).toBe(before?.participantAReadSeq);
      expect(after?.participantAArchivedAt).toEqual(before?.participantAArchivedAt);
      expect(after?.lastMessageSeq).toBe(before?.lastMessageSeq);
    });

    test('rejects self-saving and invalid or nonexistent profile identifiers', async () => {
      await expect(savedPeopleService.savePerson(buyerId, buyerId)).rejects.toThrow(/cannot save your own profile/);
      await expect(savedPeopleService.savePerson(buyerId, 'not-a-uuid')).rejects.toThrow(/Profile not found/);
      await expect(savedPeopleService.savePerson(buyerId, '99999999-9999-4999-8999-999999999999'))
        .rejects.toThrow(/Profile not found/);
    });

    test('profile Save Person action is hidden for self or when messaging is disabled', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;
      try {
        const app = createApp();
        const otherProfile = await request(app).get('/profiles/seller_user').set('Cookie', ['sb-access-token=buyer-token']);
        expect(otherProfile.text).toContain(`action="/messages/saved-people/${sellerId}"`);

        const ownProfile = await request(app).get('/profiles/seller_user').set('Cookie', ['sb-access-token=seller-token']);
        expect(ownProfile.text).not.toContain(`action="/messages/saved-people/${sellerId}"`);

        (config as any).MESSAGING_ENABLED = false;
        const hidden = await request(app).get('/profiles/seller_user').set('Cookie', ['sb-access-token=buyer-token']);
        expect(hidden.text).not.toContain(`action="/messages/saved-people/${sellerId}"`);
      } finally {
        (config as any).MESSAGING_ENABLED = originalFlag;
      }
    });

    test('saved-person mutation route enforces same-origin and is idempotent', async () => {
      const originalFlag = config.MESSAGING_ENABLED;
      (config as any).MESSAGING_ENABLED = true;
      try {
        const app = createApp();
        const forbidden = await request(app)
          .post(`/messages/saved-people/${sellerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .type('form')
          .send({ action: 'save' });
        expect(forbidden.status).toBe(403);

        const saved = await request(app)
          .post(`/messages/saved-people/${sellerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Origin', config.APP_BASE_URL)
          .type('form')
          .send({ action: 'save' });
        expect(saved.status).toBe(302);
        expect(saved.headers.location).toBe('/profiles/seller_user');

        const removed = await request(app)
          .post(`/messages/saved-people/${sellerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Origin', config.APP_BASE_URL)
          .type('form')
          .send({ action: 'remove' });
        expect(removed.status).toBe(302);
        expect(await savedPeopleService.isSavedPerson(buyerId, sellerId)).toBe(false);

        const self = await request(app)
          .post(`/messages/saved-people/${buyerId}`)
          .set('Cookie', ['sb-access-token=buyer-token'])
          .set('Origin', config.APP_BASE_URL)
          .type('form')
          .send({ action: 'save' });
        expect(self.status).toBe(400);
      } finally {
        (config as any).MESSAGING_ENABLED = originalFlag;
      }
    });

    test('uses one responsive messaging widget for desktop and mobile', async () => {
      const widgetSource = fs.readFileSync(path.join(process.cwd(), 'public/js/messaging-widget.js'), 'utf8');
      const cssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');
      const navSource = fs.readFileSync(path.join(process.cwd(), 'views/partials/nav.ejs'), 'utf8');
      expect(widgetSource).not.toContain("if (!desktopMedia.matches) return;");
      expect(widgetSource).toContain('window.visualViewport');
      expect(widgetSource).toContain('mobileDragDeltaY > 80');
      expect(widgetSource).toContain("'/assets/svg/send.svg'");
      expect(widgetSource).toContain("'/assets/svg/conversation.svg'");
      expect(cssSource).toContain('.messaging-floating-window:not([hidden])');
      expect(cssSource).toContain('height: var(--messaging-visual-viewport-height, 100dvh)');
      expect(cssSource).toContain('env(safe-area-inset-bottom, 0px)');
      expect(cssSource).toContain('@media (max-width: 1023px)');
      expect(cssSource).not.toContain('floating window is a desktop-only interaction');
      expect(cssSource).not.toMatch(/\.messaging-floating-window,\s*\.messaging-mobile-backdrop\s*\{\s*display:\s*none !important;/);
      expect(navSource).toContain('id="messaging-mobile-backdrop"');
      expect(navSource).toContain('class="mobile-you-action-link messaging-widget-trigger"');
      expect(navSource).not.toContain('Inbox &amp; Saved People');
      expect(widgetSource).not.toContain('Open full inbox');
      expect(widgetSource).not.toContain('Open full conversation');
      const sendSvgSource = fs.readFileSync(path.join(process.cwd(), 'public/assets/svg/send.svg'), 'utf8');
      expect(sendSvgSource).toContain('fill="currentColor"');
      expect(sendSvgSource).not.toContain('M0 0h512v512H0z');
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
      if (ev.type !== 'message.created') throw new Error('Expected a message-created event');
      expect(ev.conversationType).toBe('listing');
      expect(ev.listingId).toBe(publishedListingId);
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
      expect(sellerInbox.some((item) => item.conversation.id === conv.id)).toBe(false);

      // Buyer sends a new message
      await messagingService.sendMessage(conv.id, buyerId, 'New message unarchives seller thread!');

      sellerInbox = await messagingService.getInboxForUser(sellerId);
      expect(sellerInbox.some((item) => item.conversation.id === conv.id)).toBe(true);
    });
  });
});
