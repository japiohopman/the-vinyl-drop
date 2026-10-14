import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';
import { renderWithLayout } from '../utils/render';
import { messagingService } from '../services/messagingService';

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

export async function getInboxPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const summaries = await messagingService.getInboxForUser(userId);

    renderWithLayout(res, 'messages/index', {
      title: 'Inbox — Messages',
      summaries,
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

    renderWithLayout(res, 'messages/show', {
      title: `${conversation.release.artist} - ${conversation.release.title} — Conversation`,
      conversation,
      messages,
      userRole,
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
    res.redirect(`/messages/${conversation.id}`);
  } catch (err) {
    next(err);
  }
}

export async function postSendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    const { body } = req.body;

    await messagingService.sendMessage(conversationId, userId, body);
    res.redirect(`/messages/${conversationId}`);
  } catch (err) {
    next(err);
  }
}

export async function postMarkRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;

    await messagingService.markAsRead(conversationId, userId);

    if (req.accepts('json')) {
      res.status(200).json({ status: 'ok' });
      return;
    }
    res.redirect(`/messages/${conversationId}`);
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
      res.status(200).json({ status: 'ok' });
      return;
    }
    res.redirect('/messages');
  } catch (err) {
    next(err);
  }
}
