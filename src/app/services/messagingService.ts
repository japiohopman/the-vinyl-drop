import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { listings, profiles, Conversation, Message } from '../../db/schema';
import { messagingRepository, DetailedConversation, InboxConversationSummary, ParticipantRole } from '../repositories/messagingRepository';
import { emitNotificationEvent } from './notificationHooks';
import { NotFoundError, ValidationError } from './errors';

export type ConversationUserRole = 'buyer' | 'seller' | 'participantA' | 'participantB';

export class MessagingService {
  async getOrCreateConversation(listingId: string, currentUserId: string): Promise<Conversation> {
    const db = getDb();
    const listingRows = await db
      .select({
        id: listings.id,
        sellerId: listings.sellerId,
        status: listings.status,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    const listing = listingRows[0];
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.sellerId === currentUserId) {
      throw new ValidationError('Sellers cannot start a conversation on their own listing');
    }
    if (listing.status !== 'published') {
      throw new ValidationError('Conversations can only be started on published listings');
    }

    const existing = await messagingRepository.findConversationByListingAndBuyer(listingId, currentUserId);
    if (existing) {
      if (existing.participantAArchivedAt !== null) {
        await messagingRepository.setArchiveState(existing.id, 'participantA', false);
        existing.participantAArchivedAt = null;
      }
      return existing;
    }

    return messagingRepository.createListingConversation(listingId, currentUserId, listing.sellerId);
  }

  async getOrCreateDirectConversation(targetProfileId: string, currentUserId: string): Promise<Conversation> {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(targetProfileId)) {
      throw new NotFoundError('Profile not found');
    }
    if (targetProfileId === currentUserId) {
      throw new ValidationError('You cannot start a conversation with yourself');
    }

    const db = getDb();
    const profileRows = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, targetProfileId))
      .limit(1);
    if (!profileRows[0]) throw new NotFoundError('Profile not found');

    const participantAId = currentUserId < targetProfileId ? currentUserId : targetProfileId;
    const participantBId = currentUserId < targetProfileId ? targetProfileId : currentUserId;
    const existing = await messagingRepository.findConversationByDirectPair(participantAId, participantBId);
    if (existing) {
      const role: ParticipantRole = existing.participantAId === currentUserId
        ? 'participantA'
        : 'participantB';
      const archivedAt = role === 'participantA'
        ? existing.participantAArchivedAt
        : existing.participantBArchivedAt;
      if (archivedAt !== null) {
        await messagingRepository.setArchiveState(existing.id, role, false);
        if (role === 'participantA') existing.participantAArchivedAt = null;
        else existing.participantBArchivedAt = null;
      }
      return existing;
    }

    return messagingRepository.createDirectConversation(participantAId, participantBId);
  }

  async getInboxForUser(currentUserId: string): Promise<InboxConversationSummary[]> {
    return messagingRepository.getInboxForUser(currentUserId);
  }

  async getUnreadCountForUser(currentUserId: string): Promise<number> {
    return messagingRepository.getUnreadCountForUser(currentUserId);
  }

  async getConversationDetail(
    conversationId: string,
    currentUserId: string
  ): Promise<{ conversation: DetailedConversation; messages: Message[]; userRole: ConversationUserRole }> {
    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');

    const isParticipantA = conversation.participantA.id === currentUserId;
    const isParticipantB = conversation.participantB.id === currentUserId;
    if (!isParticipantA && !isParticipantB) throw new NotFoundError('Conversation not found');

    const messages = await messagingRepository.getMessagesForConversation(conversationId);
    const userRole: ConversationUserRole = conversation.conversationType === 'listing'
      ? (isParticipantA ? 'buyer' : 'seller')
      : (isParticipantA ? 'participantA' : 'participantB');

    return { conversation, messages, userRole };
  }

  async sendMessage(conversationId: string, currentUserId: string, bodyInput: string): Promise<Message> {
    const trimmedBody = bodyInput ? bodyInput.trim() : '';
    if (!trimmedBody) throw new ValidationError('Message body cannot be empty');
    if (trimmedBody.length > 4000) {
      throw new ValidationError('Message body cannot exceed 4,000 characters');
    }

    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');

    const isParticipantA = conversation.participantA.id === currentUserId;
    const isParticipantB = conversation.participantB.id === currentUserId;
    if (!isParticipantA && !isParticipantB) throw new NotFoundError('Conversation not found');

    const recipientId = isParticipantA ? conversation.participantB.id : conversation.participantA.id;
    const newMessage = await messagingRepository.createMessage(conversationId, currentUserId, trimmedBody);

    const eventBase = {
      actorId: currentUserId,
      recipientId,
      conversationId,
      messageId: newMessage.id,
      createdAt: newMessage.createdAt,
    };
    if (conversation.conversationType === 'listing') {
      if (!conversation.listing) throw new Error('Listing conversation is missing its Listing context');
      await emitNotificationEvent({
        ...eventBase,
        type: 'message.created',
        conversationType: 'listing',
        listingId: conversation.listing.id,
      });
    } else {
      await emitNotificationEvent({
        ...eventBase,
        type: 'message.created',
        conversationType: 'direct',
      });
    }

    return newMessage;
  }

  async markAsRead(conversationId: string, currentUserId: string): Promise<void> {
    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    const role = this.participantRoleForUser(conversation, currentUserId);
    await messagingRepository.markAsRead(conversationId, role);
  }

  async archiveConversation(conversationId: string, currentUserId: string): Promise<void> {
    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    const role = this.participantRoleForUser(conversation, currentUserId);
    await messagingRepository.setArchiveState(conversationId, role, true);
  }

  private participantRoleForUser(conversation: DetailedConversation, currentUserId: string): ParticipantRole {
    if (conversation.participantA.id === currentUserId) return 'participantA';
    if (conversation.participantB.id === currentUserId) return 'participantB';
    throw new NotFoundError('Conversation not found');
  }
}

export const messagingService = new MessagingService();
