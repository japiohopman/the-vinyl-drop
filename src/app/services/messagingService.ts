import { getDb } from '../../db';
import { listings, Conversation, Message } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { messagingRepository, DetailedConversation, InboxConversationSummary } from '../repositories/messagingRepository';
import { emitNotificationEvent } from './notificationHooks';
import { NotFoundError, ValidationError } from './errors';

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
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.sellerId === currentUserId) {
      throw new ValidationError('Sellers cannot start a conversation on their own listing');
    }

    if (listing.status !== 'published') {
      throw new ValidationError('Conversations can only be started on published listings');
    }

    const existing = await messagingRepository.findConversationByListingAndBuyer(listingId, currentUserId);
    if (existing) {
      // Reopening an archived conversation clears archive state for the caller
      if (existing.buyerArchivedAt !== null) {
        await messagingRepository.setArchiveState(existing.id, 'buyer', false);
        existing.buyerArchivedAt = null;
      }
      return existing;
    }

    return messagingRepository.createConversation(listingId, currentUserId);
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
  ): Promise<{ conversation: DetailedConversation; messages: Message[]; userRole: 'buyer' | 'seller' }> {
    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isBuyer = conversation.buyer.id === currentUserId;
    const isSeller = conversation.seller.id === currentUserId;

    if (!isBuyer && !isSeller) {
      throw new NotFoundError('Conversation not found');
    }

    const messages = await messagingRepository.getMessagesForConversation(conversationId);
    const userRole = isBuyer ? 'buyer' : 'seller';

    return { conversation, messages, userRole };
  }

  async sendMessage(
    conversationId: string,
    currentUserId: string,
    bodyInput: string
  ): Promise<Message> {
    const trimmedBody = bodyInput ? bodyInput.trim() : '';
    if (!trimmedBody || trimmedBody.length === 0) {
      throw new ValidationError('Message body cannot be empty');
    }
    if (trimmedBody.length > 4000) {
      throw new ValidationError('Message body cannot exceed 4,000 characters');
    }

    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isBuyer = conversation.buyer.id === currentUserId;
    const isSeller = conversation.seller.id === currentUserId;

    if (!isBuyer && !isSeller) {
      throw new NotFoundError('Conversation not found');
    }

    const recipientRole: 'buyer' | 'seller' = isBuyer ? 'seller' : 'buyer';
    const recipientId = isBuyer ? conversation.seller.id : conversation.buyer.id;

    const newMessage = await messagingRepository.createMessage(
      conversationId,
      currentUserId,
      trimmedBody,
      recipientRole
    );

    // Automatically update sender's read timestamp when posting
    const now = new Date();
    await messagingRepository.markAsRead(conversationId, isBuyer ? 'buyer' : 'seller', now);

    // Emit private notification hook to the recipient
    await emitNotificationEvent({
      type: 'message.created',
      actorId: currentUserId,
      recipientId,
      listingId: conversation.listing.id,
      conversationId,
      messageId: newMessage.id,
      createdAt: newMessage.createdAt,
    });

    return newMessage;
  }

  async markAsRead(conversationId: string, currentUserId: string): Promise<void> {
    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isBuyer = conversation.buyer.id === currentUserId;
    const isSeller = conversation.seller.id === currentUserId;

    if (!isBuyer && !isSeller) {
      throw new NotFoundError('Conversation not found');
    }

    await messagingRepository.markAsRead(conversationId, isBuyer ? 'buyer' : 'seller', new Date());
  }

  async archiveConversation(conversationId: string, currentUserId: string): Promise<void> {
    const conversation = await messagingRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isBuyer = conversation.buyer.id === currentUserId;
    const isSeller = conversation.seller.id === currentUserId;

    if (!isBuyer && !isSeller) {
      throw new NotFoundError('Conversation not found');
    }

    await messagingRepository.setArchiveState(conversationId, isBuyer ? 'buyer' : 'seller', true);
  }
}

export const messagingService = new MessagingService();
