import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';
import { renderWithLayout } from '../utils/render';
import { messagingService } from '../services/messagingService';
import { savedPeopleService } from '../services/savedPeopleService';
import { ValidationError } from '../services/errors';

export function messagingFeatureGuard(req: Request, res: Response, next: NextFunction): void {
  if (!config.MESSAGING_ENABLED) {
    if (req.accepts('html')) {
      res.status(404);
      return renderWithLayout(res, 'errors/404', {
        title: '404 - Page Not Found',
        message: 'The requested page could not be found.',
      });
    }
    res.status(404).json({ error: 'Messaging feature disabled' });
    return;
  }
  next();
}

export async function getWidgetUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unreadCount = await messagingService.getUnreadCountForUser(req.user!.id);
    res.set('Cache-Control', 'no-store').json({ unreadCount });
  } catch (err) {
    next(err);
  }
}

export async function getWidgetInbox(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summaries = await messagingService.getInboxForUser(req.user!.id);
    const conversations = summaries.map((item) => ({
      id: item.conversation.id,
      conversationType: item.conversation.conversationType,
      releaseArtist: item.release?.artist ?? null,
      releaseTitle: item.release?.title ?? null,
      otherParticipant: item.otherParticipant.displayName || '@' + item.otherParticipant.username,
      otherParticipantUsername: item.otherParticipant.username,
      lastMessage: item.lastMessage?.body ?? '',
      lastMessageAt: item.lastMessage?.createdAt ?? null,
      unreadCount: item.unreadCount,
    }));
    const unreadCount = conversations.reduce((total, item) => total + item.unreadCount, 0);
    res.set('Cache-Control', 'no-store').json({ unreadCount, conversations });
  } catch (err) {
    next(err);
  }
}

export async function getWidgetConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    const { conversation, messages, userRole } = await messagingService.getConversationDetail(
      conversationId,
      userId
    );
    const otherParticipant = conversation.participantA.id === userId
      ? conversation.participantB
      : conversation.participantA;
    const inbox = await messagingService.getInboxForUser(userId);
    const unreadCount = inbox.find((item) => item.conversation.id === conversation.id)?.unreadCount ?? 0;
    res.set('Cache-Control', 'no-store').json({
      id: conversation.id,
      conversationType: conversation.conversationType,
      title: conversation.release
        ? conversation.release.artist + ' — ' + conversation.release.title
        : '@' + otherParticipant.username,
      release: conversation.release,
      listing: conversation.listing ? { id: conversation.listing.id } : null,
      userRole,
      unreadCount,
      otherParticipant: {
        id: otherParticipant.id,
        username: otherParticipant.username,
        displayName: otherParticipant.displayName,
        avatarUrl: otherParticipant.avatarUrl,
      },
      messages: messages.map((message) => ({
        id: message.id,
        messageSeq: message.messageSeq,
        isOwnMessage: message.senderId === userId,
        body: message.body,
        createdAt: message.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getInboxPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const summaries = await messagingService.getInboxForUser(userId);

    const savedPeople = await savedPeopleService.getSavedPeopleForUser(userId);
    renderWithLayout(res, 'messages/index', {
      title: 'Inbox — Messages',
      summaries,
      savedPeople,
      user: req.user,
      profile: req.profile,
    });
  } catch (err) {
    next(err);
  }
}

export async function getConversationPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    const { conversation, messages, userRole } = await messagingService.getConversationDetail(
      conversationId,
      userId
    );
    const otherParticipant = conversation.participantA.id === userId
      ? conversation.participantB
      : conversation.participantA;
    const title = conversation.release
      ? conversation.release.artist + ' — ' + conversation.release.title + ' — Conversation'
      : 'Direct message with @' + otherParticipant.username;

    renderWithLayout(res, 'messages/show', {
      title,
      conversation,
      messages,
      userRole,
      otherParticipant,
      readThroughSeq: messages.length ? messages[messages.length - 1].messageSeq : 0,
      user: req.user,
      profile: req.profile,
      query: req.query,
    });
  } catch (err) {
    next(err);
  }
}

export async function postStartConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { listingId } = req.params;
    const conversation = await messagingService.getOrCreateConversation(listingId, userId);
    res.redirect('/messages/' + conversation.id);
  } catch (err) {
    next(err);
  }
}

export async function postStartDirectConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { profileId } = req.params;
    const conversation = await messagingService.getOrCreateDirectConversation(profileId, userId);
    res.redirect('/messages/' + conversation.id);
  } catch (err) {
    next(err);
  }
}

export async function postSendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    const { body } = req.body || {};

    if (typeof body !== 'string') {
      throw new ValidationError('Message body must be a text string');
    }

    const message = await messagingService.sendMessage(conversationId, userId, body);
    if (req.get('X-Messaging-Widget') === '1') {
      res.set('Cache-Control', 'no-store').status(201).json({
        status: 'ok',
        message: {
          id: message.id,
          messageSeq: message.messageSeq,
          isOwnMessage: true,
          body: message.body,
          createdAt: message.createdAt,
        },
      });
      return;
    }
    res.redirect('/messages/' + conversationId);
  } catch (err) {
    next(err);
  }
}

export async function postMarkRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    const rawMessageSeq = (req.body || {}).messageSeq;
    const messageSeq = typeof rawMessageSeq === 'number'
      ? rawMessageSeq
      : typeof rawMessageSeq === 'string' && /^\\d+$/.test(rawMessageSeq)
        ? Number(rawMessageSeq)
        : Number.NaN;
    if (!Number.isSafeInteger(messageSeq) || messageSeq < 0) {
      throw new ValidationError('messageSeq must be a non-negative integer');
    }
    await messagingService.markAsRead(conversationId, userId, messageSeq);

    if (req.accepts('json')) {
      res.set('Cache-Control', 'no-store').status(200).json({ status: 'ok' });
      return;
    }
    res.redirect('/messages/' + conversationId);
  } catch (err) {
    next(err);
  }
}

export async function postArchiveConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    await messagingService.archiveConversation(conversationId, userId);

    if (req.accepts('json')) {
      res.set('Cache-Control', 'no-store').status(200).json({ status: 'ok' });
      return;
    }
    res.redirect('/messages');
  } catch (err) {
    next(err);
  }
}
