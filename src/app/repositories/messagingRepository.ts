import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { listings, physicalCopies, profiles, releases, conversations, messages, Conversation, Message } from '../../db/schema';

export interface InboxConversationSummary {
  conversation: Conversation;
  listing: {
    id: string;
    status: string;
    price: number | null;
    currency: string;
    tradeAvailable: boolean;
  };
  release: {
    artist: string;
    title: string;
  };
  otherParticipant: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  lastMessage: Message | null;
  unreadCount: number;
}

export interface DetailedConversation extends Conversation {
  sellerId: string;
  listing: {
    id: string;
    status: string;
    price: number | null;
    currency: string;
    tradeAvailable: boolean;
  };
  release: {
    artist: string;
    title: string;
  };
  buyer: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  seller: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export class MessagingRepository {
  async findConversationByListingAndBuyer(listingId: string, buyerId: string): Promise<Conversation | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.listingId, listingId), eq(conversations.buyerId, buyerId)))
      .limit(1);
    return rows[0] || null;
  }

  async findConversationById(conversationId: string): Promise<DetailedConversation | null> {
    const db = getDb();
    const rows = await db
      .select({
        conversation: conversations,
        sellerId: listings.sellerId,
        listingId: listings.id,
        listingStatus: listings.status,
        listingPrice: listings.price,
        listingCurrency: listings.currency,
        listingTradeAvailable: listings.tradeAvailable,
        artist: releases.artist,
        title: releases.title,
        buyerId: profiles.id,
        buyerUsername: profiles.username,
        buyerDisplayName: profiles.displayName,
        buyerAvatarUrl: profiles.avatarUrl,
      })
      .from(conversations)
      .innerJoin(listings, eq(conversations.listingId, listings.id))
      .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
      .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
      .innerJoin(profiles, eq(conversations.buyerId, profiles.id))
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];

    const sellerProfiles = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, row.sellerId))
      .limit(1);

    const seller = sellerProfiles[0];
    if (!seller) return null;

    return {
      ...row.conversation,
      sellerId: row.sellerId,
      listing: {
        id: row.listingId,
        status: row.listingStatus,
        price: row.listingPrice,
        currency: row.listingCurrency,
        tradeAvailable: row.listingTradeAvailable,
      },
      release: {
        artist: row.artist,
        title: row.title,
      },
      buyer: {
        id: row.buyerId,
        username: row.buyerUsername,
        displayName: row.buyerDisplayName,
        avatarUrl: row.buyerAvatarUrl,
      },
      seller: {
        id: seller.id,
        username: seller.username,
        displayName: seller.displayName,
        avatarUrl: seller.avatarUrl,
      },
    };
  }

  async createConversation(listingId: string, buyerId: string): Promise<Conversation> {
    const db = getDb();
    const rows = await db
      .insert(conversations)
      .values({
        listingId,
        buyerId,
      })
      .onConflictDoNothing()
      .returning();

    if (rows.length > 0) {
      return rows[0];
    }

    const existing = await this.findConversationByListingAndBuyer(listingId, buyerId);
    if (!existing) {
      throw new Error('Failed to create or retrieve conversation');
    }
    return existing;
  }

  async getInboxForUser(userId: string): Promise<InboxConversationSummary[]> {
    const db = getDb();
    const rows = await db
      .select({
        conversation: conversations,
        sellerId: listings.sellerId,
        listingId: listings.id,
        listingStatus: listings.status,
        listingPrice: listings.price,
        listingCurrency: listings.currency,
        listingTradeAvailable: listings.tradeAvailable,
        artist: releases.artist,
        title: releases.title,
      })
      .from(conversations)
      .innerJoin(listings, eq(conversations.listingId, listings.id))
      .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
      .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
      .where(
        or(
          and(eq(conversations.buyerId, userId), isNull(conversations.buyerArchivedAt)),
          and(eq(listings.sellerId, userId), isNull(conversations.sellerArchivedAt))
        )
      )
      .orderBy(sql`${conversations.updatedAt} DESC`);

    const summaries: InboxConversationSummary[] = [];

    for (const row of rows) {
      const isBuyer = row.conversation.buyerId === userId;
      const otherParticipantId = isBuyer ? row.sellerId : row.conversation.buyerId;

      const otherProfiles = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, otherParticipantId))
        .limit(1);

      const otherProfile = otherProfiles[0] || {
        id: otherParticipantId,
        username: 'unknown',
        displayName: 'Unknown User',
        avatarUrl: null,
      };

      const lastMessageRows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, row.conversation.id))
        .orderBy(sql`${messages.createdAt} DESC`, sql`${messages.id} DESC`)
        .limit(1);

      const lastMessage = lastMessageRows[0] || null;

      const lastReadAt = isBuyer ? row.conversation.buyerReadAt : row.conversation.sellerReadAt;

      let unreadCount = 0;
      if (lastReadAt) {
        const unreadRows = await db
          .select({ count: sql<number>`count(*)` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, row.conversation.id),
              sql`${messages.senderId} <> ${userId}`,
              gte(messages.createdAt, lastReadAt)
            )
          );
        unreadCount = Number(unreadRows[0]?.count || 0);
      } else {
        const unreadRows = await db
          .select({ count: sql<number>`count(*)` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, row.conversation.id),
              sql`${messages.senderId} <> ${userId}`
            )
          );
        unreadCount = Number(unreadRows[0]?.count || 0);
      }

      summaries.push({
        conversation: row.conversation,
        listing: {
          id: row.listingId,
          status: row.listingStatus,
          price: row.listingPrice,
          currency: row.listingCurrency,
          tradeAvailable: row.listingTradeAvailable,
        },
        release: {
          artist: row.artist,
          title: row.title,
        },
        otherParticipant: {
          id: otherProfile.id,
          username: otherProfile.username,
          displayName: otherProfile.displayName,
          avatarUrl: otherProfile.avatarUrl,
        },
        lastMessage,
        unreadCount,
      });
    }

    return summaries;
  }

  async getUnreadCountForUser(userId: string): Promise<number> {
    const db = getDb();
    const buyerUnread = and(
      eq(conversations.buyerId, userId),
      isNull(conversations.buyerArchivedAt),
      sql`${messages.senderId} <> ${userId}`,
      or(isNull(conversations.buyerReadAt), gte(messages.createdAt, conversations.buyerReadAt))
    );
    const sellerUnread = and(
      eq(listings.sellerId, userId),
      isNull(conversations.sellerArchivedAt),
      sql`${messages.senderId} <> ${userId}`,
      or(isNull(conversations.sellerReadAt), gte(messages.createdAt, conversations.sellerReadAt))
    );

    const rows = await db
      .select({ count: sql<number>`count(${messages.id})` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(listings, eq(conversations.listingId, listings.id))
      .where(or(buyerUnread, sellerUnread));

    return Number(rows[0]?.count ?? 0);
  }

  async getMessagesForConversation(conversationId: string): Promise<Message[]> {
    const db = getDb();
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt, messages.id);
  }

  async createMessage(
    conversationId: string,
    senderId: string,
    body: string,
    recipientRole: 'buyer' | 'seller'
  ): Promise<Message> {
    const db = getDb();
    const now = new Date();

    const [newMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId,
        body,
        createdAt: now,
      })
      .returning();

    const updateFields: Partial<Conversation> = {
      updatedAt: now,
    };

    if (recipientRole === 'buyer') {
      updateFields.buyerArchivedAt = null;
    } else {
      updateFields.sellerArchivedAt = null;
    }

    await db
      .update(conversations)
      .set(updateFields)
      .where(eq(conversations.id, conversationId));

    return newMessage;
  }

  async markAsRead(conversationId: string, role: 'buyer' | 'seller', readAt: Date): Promise<void> {
    const db = getDb();
    if (role === 'buyer') {
      await db
        .update(conversations)
        .set({ buyerReadAt: readAt })
        .where(eq(conversations.id, conversationId));
    } else {
      await db
        .update(conversations)
        .set({ sellerReadAt: readAt })
        .where(eq(conversations.id, conversationId));
    }
  }

  async setArchiveState(conversationId: string, role: 'buyer' | 'seller', archived: boolean): Promise<void> {
    const db = getDb();
    const archivedAt = archived ? new Date() : null;
    if (role === 'buyer') {
      await db
        .update(conversations)
        .set({ buyerArchivedAt: archivedAt })
        .where(eq(conversations.id, conversationId));
    } else {
      await db
        .update(conversations)
        .set({ sellerArchivedAt: archivedAt })
        .where(eq(conversations.id, conversationId));
    }
  }
}

export const messagingRepository = new MessagingRepository();
