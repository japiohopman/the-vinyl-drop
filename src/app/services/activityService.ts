import { getDb } from '../../db';
import {
  createActivityEvent,
  getRecentActivityEvents,
  JoinedActivityRecord,
} from '../repositories/activityRepository';
import { formatPrice } from '../view-models/listingCardViewModel';

type DbInstance = ReturnType<typeof getDb>;

export interface ActivityItemViewModel {
  id: string;
  eventType: 'listing.published' | 'comment.created' | 'favorite.created';
  eventDescription: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  listingId: string;
  listingUrl: string;
  releaseTitle: string;
  releaseArtist: string;
  releaseCoverArtUrl: string | null;
  priceFormatted: string | null;
  commentContent: string | null;
  createdAt: Date;
  timeAgo: string;
  isPrivate: boolean;
}

export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 30) return `${diffInDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatActivityRecord(record: JoinedActivityRecord): ActivityItemViewModel {
  const isPrivate = record.eventType === 'favorite.created';
  const isTradeOnly = record.listingTradeAvailable && record.listingPrice === null;
  const priceFormatted = formatPrice(record.listingPrice, isTradeOnly);

  let eventDescription = '';
  if (record.eventType === 'listing.published') {
    eventDescription = `@${record.actorUsername} published a drop`;
  } else if (record.eventType === 'comment.created') {
    eventDescription = `@${record.actorUsername} commented on a drop`;
  } else if (record.eventType === 'favorite.created') {
    eventDescription = `You favorited a drop`;
  }

  return {
    id: record.id,
    eventType: record.eventType as ActivityItemViewModel['eventType'],
    eventDescription,
    actorUsername: record.actorUsername,
    actorDisplayName: record.actorDisplayName,
    actorAvatarUrl: record.actorAvatarUrl,
    listingId: record.listingId,
    listingUrl: `/listings/${record.listingId}`,
    releaseTitle: record.releaseTitle,
    releaseArtist: record.releaseArtist,
    releaseCoverArtUrl: record.releaseCoverArtUrl,
    priceFormatted,
    commentContent: record.commentContent,
    createdAt: record.createdAt,
    timeAgo: formatTimeAgo(record.createdAt),
    isPrivate,
  };
}

export async function recordListingPublishedEvent(
  sellerId: string,
  listingId: string,
  dbOverride?: DbInstance
): Promise<void> {
  await createActivityEvent(
    {
      eventType: 'listing.published',
      actorId: sellerId,
      listingId,
    },
    dbOverride
  );
}

export async function recordCommentCreatedEvent(
  authorId: string,
  listingId: string,
  commentId: string,
  dbOverride?: DbInstance
): Promise<void> {
  await createActivityEvent(
    {
      eventType: 'comment.created',
      actorId: authorId,
      listingId,
      commentId,
    },
    dbOverride
  );
}

export async function getRecentActivityFeed(
  requestingUserId?: string,
  limit = 50,
  dbOverride?: DbInstance
): Promise<ActivityItemViewModel[]> {
  const records = await getRecentActivityEvents({ requestingUserId, limit }, dbOverride);
  return records.map(formatActivityRecord);
}
