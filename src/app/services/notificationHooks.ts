type NotificationBase = {
  actorId: string;
  recipientId: string;
  createdAt: Date;
};

type ListingActivityEvent = NotificationBase & {
  type: 'comment.created' | 'favorite.created';
  listingId: string;
  commentId?: string;
};

type ListingMessageCreatedEvent = NotificationBase & {
  type: 'message.created';
  conversationType: 'listing';
  listingId: string;
  conversationId: string;
  messageId: string;
};

type DirectMessageCreatedEvent = NotificationBase & {
  type: 'message.created';
  conversationType: 'direct';
  listingId?: never;
  conversationId: string;
  messageId: string;
};

/**
 * Notification events are deliberately body-free. Listing-specific activity always has
 * real listing context; direct messages must not smuggle in a placeholder listing ID.
 */
export type NotificationEvent =
  | ListingActivityEvent
  | ListingMessageCreatedEvent
  | DirectMessageCreatedEvent;

export type NotificationHandler = (event: NotificationEvent) => void | Promise<void>;

const listeners: Set<NotificationHandler> = new Set();

export function onNotification(handler: NotificationHandler): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

export async function emitNotificationEvent(event: NotificationEvent): Promise<void> {
  if (event.actorId === event.recipientId) return;

  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (err) {
      // Do not log the event itself: it is private messaging metadata.
      console.error('Error in notification listener:', err instanceof Error ? err.name : 'unknown error');
    }
  }
}

export function clearNotificationListeners(): void {
  listeners.clear();
}

export function getNotificationListenerCount(): number {
  return listeners.size;
}
