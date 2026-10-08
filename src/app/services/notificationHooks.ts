export interface NotificationEvent {
  type: 'comment.created' | 'favorite.created';
  actorId: string;
  recipientId: string;
  listingId: string;
  commentId?: string;
  createdAt: Date;
}

export type NotificationHandler = (event: NotificationEvent) => void | Promise<void>;

const listeners: Set<NotificationHandler> = new Set();

export function onNotification(handler: NotificationHandler): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

export async function emitNotificationEvent(event: NotificationEvent): Promise<void> {
  if (event.actorId === event.recipientId) {
    return;
  }

  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (err) {
      console.error('Error in notification listener:', err);
    }
  }
}

export function clearNotificationListeners(): void {
  listeners.clear();
}

export function getNotificationListenerCount(): number {
  return listeners.size;
}
