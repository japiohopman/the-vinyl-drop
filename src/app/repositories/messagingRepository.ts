import { and, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { conversations, listings, messages, physicalCopies, profiles, releases, Conversation, Message } from '../../db/schema';

export interface ParticipantSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ListingSummary {
  id: string;
  status: string;
  price: number | null;
  currency: string;
  tradeAvailable: boolean;
}

export interface ReleaseSummary {
  artist: string;
  title: string;
}

export interface InboxConversationSummary {
  conversation: Conversation;
  listing: ListingSummary | null;
  release: ReleaseSummary | null;
  otherParticipant: ParticipantSummary;
  lastMessage: Message | null;
  unreadCount: number;
}

export interface DetailedConversation extends Conversation {
  listing: ListingSummary | null;
  release: ReleaseSummary | null;
  participantA: ParticipantSummary;
  participantB: ParticipantSummary;
}

export type ParticipantRole = 'participantA' | 'participantB';

export class MessagingRepository {
  async findConversationByListingAndBuyer(listingId: string, buyerId: string): Promise<Conversation | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.conversationType, 'listing'),
        eq(conversations.listingId, listingId),
        eq(conversations.participantAId, buyerId)
      ))
      .limit(1);
    return rows[0] || null;
  }

  async findConversationByDirectPair(participantAId: string, participantBId: string): Promise<Conversation | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.conversationType, 'direct'),
        eq(conversations.participantAId, participantAId),
        eq(conversations.participantBId, participantBId)
      ))
      .limit(1);
    return rows[0] || null;
  }

  async findConversationById(conversationId: string): Promise<DetailedConversation | null> {
    const db = getDb();
    const rows = await db
      .select({
        conversation: conversations,
        listingId: listings.id,
        listingStatus: listings.status,
        listingPrice: listings.price,
        listingCurrency: listings.currency,
        listingTradeAvailable: listings.tradeAvailable,
        artist: releases.artist,
        title: releases.title,
      })
      .from(conversations)
      .leftJoin(listings, eq(conversations.listingId, listings.id))
      .leftJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
      .leftJoin(releases, eq(physicalCopies.releaseId, releases.id))
      .where(eq(conversations.id, conversationId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const [participantA, participantB] = await Promise.all([
      this.findParticipantSummary(row.conversation.participantAId),
      this.findParticipantSummary(row.conversation.participantBId),
    ]);
    if (!participantA || !participantB) return null;

    const listing: ListingSummary | null = row.listingId
      ? {
          id: row.listingId,
          status: row.listingStatus || 'unknown',
          price: row.listingPrice,
          currency: row.listingCurrency || 'EUR',
          tradeAvailable: Boolean(row.listingTradeAvailable),
        }
      : null;
    const release: ReleaseSummary | null =
      row.artist !== null && row.artist !== undefined &&
      row.title !== null && row.title !== undefined
        ? { artist: row.artist, title: row.title }
        : null;

    return {
      ...row.conversation,
      listing,
      release,
      participantA,
      participantB,
    };
  }

  private async findParticipantSummary(id: string): Promise<ParticipantSummary | null> {
    const db = getDb();
    const rows = await db
      .select({
        id: profiles.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    return rows[0] || null;
  }

  async createListingConversation(listingId: string, buyerId: string, sellerId: string): Promise<Conversation> {
    const db = getDb();
    const rows = await db
      .insert(conversations)
      .values({
        conversationType: 'listing',
        listingId,
        participantAId: buyerId,
        participantBId: sellerId,
      })
      .onConflictDoNothing()
      .returning();

    if (rows.length > 0) return rows[0];

    const existing = await this.findConversationByListingAndBuyer(listingId, buyerId);
    if (!existing) throw new Error('Failed to create or retrieve listing conversation');
    return existing;
  }

  async createDirectConversation(participantAId: string, participantBId: string): Promise<Conversation> {
    const db = getDb();
    const rows = await db
      .insert(conversations)
      .values({
        conversationType: 'direct',
        listingId: null,
        participantAId,
        participantBId,
      })
      .onConflictDoNothing()
      .returning();

    if (rows.length > 0) return rows[0];

    const existing = await this.findConversationByDirectPair(participantAId, participantBId);
    if (!existing) throw new Error('Failed to create or retrieve direct conversation');
    return existing;
  }

  async getInboxForUser(userId: string): Promise<InboxConversationSummary[]> {
    const db = getDb();
    const rows = await db
      .select({
        conversation: conversations,
        listingId: listings.id,
        listingStatus: listings.status,
        listingPrice: listings.price,
        listingCurrency: listings.currency,
        listingTradeAvailable: listings.tradeAvailable,
        artist: releases.artist,
        title: releases.title,
      })
      .from(conversations)
      .leftJoin(listings, eq(conversations.listingId, listings.id))
      .leftJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
      .leftJoin(releases, eq(physicalCopies.releaseId, releases.id))
      .where(or(
        and(eq(conversations.participantAId, userId), isNull(conversations.participantAArchivedAt)),
        and(eq(conversations.participantBId, userId), isNull(conversations.participantBArchivedAt))
      ))
      .orderBy(desc(conversations.updatedAt));

    const summaries: InboxConversationSummary[] = [];

    for (const row of rows) {
      const isParticipantA = row.conversation.participantAId === userId;
      const otherParticipantId = isParticipantA
        ? row.conversation.participantBId
        : row.conversation.participantAId;
      const otherParticipant = await this.findParticipantSummary(otherParticipantId);
      if (!otherParticipant) continue;

      const lastMessageRows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, row.conversation.id))
        .orderBy(desc(messages.messageSeq))
        .limit(1);
      const lastMessage = lastMessageRows[0] || null;
      const readSeq = isParticipantA
        ? row.conversation.participantAReadSeq
        : row.conversation.participantBReadSeq;
      const unreadRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(
          eq(messages.conversationId, row.conversation.id),
          ne(messages.senderId, userId),
          gt(messages.messageSeq, readSeq)
        ));

      const listing: ListingSummary | null = row.listingId
        ? {
            id: row.listingId,
            status: row.listingStatus || 'unknown',
            price: row.listingPrice,
            currency: row.listingCurrency || 'EUR',
            tradeAvailable: Boolean(row.listingTradeAvailable),
          }
        : null;
      const release: ReleaseSummary | null =
        row.artist !== null && row.artist !== undefined &&
        row.title !== null && row.title !== undefined
          ? { artist: row.artist, title: row.title }
          : null;

      summaries.push({
        conversation: row.conversation,
        listing,
        release,
        otherParticipant,
        lastMessage,
        unreadCount: Number(unreadRows[0]?.count || 0),
      });
    }

    return summaries;
  }

  async getUnreadCountForUser(userId: string): Promise<number> {
    const db = getDb();
    const participantAUnread = and(
      eq(conversations.participantAId, userId),
      isNull(conversations.participantAArchivedAt),
      ne(messages.senderId, userId),
      gt(messages.messageSeq, conversations.participantAReadSeq)
    );
    const participantBUnread = and(
      eq(conversations.participantBId, userId),
      isNull(conversations.participantBArchivedAt),
      ne(messages.senderId, userId),
      gt(messages.messageSeq, conversations.participantBReadSeq)
    );
    const rows = await db
      .select({ count: sql<number>`count(${messages.id})` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(or(participantAUnread, participantBUnread));
    return Number(rows[0]?.count ?? 0);
  }

  async getMessagesForConversation(conversationId: string): Promise<Message[]> {
    const db = getDb();
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.messageSeq);
  }

  async createMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
    const db = getDb();
    const [newMessage] = await db
      .insert(messages)
      .values({ conversationId, senderId, body })
      .returning();
    return newMessage;
  }

  async hasMessageSequence(conversationId: string, messageSeq: number): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        eq(messages.messageSeq, messageSeq)
      ))
      .limit(1);
    return rows.length > 0;
  }

  async markAsRead(conversationId: string, role: ParticipantRole, messageSeq: number): Promise<void> {
    const db = getDb();
    const readAt = new Date();
    if (role === 'participantA') {
      await db
        .update(conversations)
        .set({
          participantAReadSeq: sql`GREATEST(${conversations.participantAReadSeq}, ${messageSeq})`,
          participantAReadAt: readAt,
        })
        .where(eq(conversations.id, conversationId));
    } else {
      await db
        .update(conversations)
        .set({
          participantBReadSeq: sql`GREATEST(${conversations.participantBReadSeq}, ${messageSeq})`,
          participantBReadAt: readAt,
        })
        .where(eq(conversations.id, conversationId));
    }
  }

  async setArchiveState(conversationId: string, role: ParticipantRole, archived: boolean): Promise<void> {
    const db = getDb();
    const archivedAt = archived ? new Date() : null;
    if (role === 'participantA') {
      await db
        .update(conversations)
        .set({ participantAArchivedAt: archivedAt })
        .where(eq(conversations.id, conversationId));
    } else {
      await db
        .update(conversations)
        .set({ participantBArchivedAt: archivedAt })
        .where(eq(conversations.id, conversationId));
    }
  }
}

export const messagingRepository = new MessagingRepository();
