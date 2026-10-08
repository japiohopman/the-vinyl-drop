import { getDb } from '../../db';
import { Favorite } from '../../db/schema/favorites';
import {
  addFavorite as addFavoriteInRepo,
  isFavorited as isFavoritedInRepo,
  removeFavorite as removeFavoriteInRepo,
  findFavoritesByUserId,
} from '../repositories/favoriteRepository';
import { createActivityEvent, deleteFavoriteActivityEvent } from '../repositories/activityRepository';
import { findListingById } from '../repositories/listingRepository';
import { emitNotificationEvent } from './notificationHooks';
import { AuthorizationError, NotFoundError } from './errors';

type DbInstance = ReturnType<typeof getDb>;

export async function addFavorite(
  userId: string,
  listingId: string,
  dbOverride?: DbInstance
): Promise<Favorite | null> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  if (listing.status !== 'published') {
    throw new AuthorizationError('Cannot favorite an unpublished listing');
  }

  const favorite = await addFavoriteInRepo(userId, listingId, dbOverride);

  await createActivityEvent(
    {
      eventType: 'favorite.created',
      actorId: userId,
      listingId,
    },
    dbOverride
  );

  if (listing.sellerId !== userId) {
    await emitNotificationEvent({
      type: 'favorite.created',
      actorId: userId,
      recipientId: listing.sellerId,
      listingId,
      createdAt: new Date(),
    });
  }

  return favorite;
}

export async function removeFavorite(
  userId: string,
  listingId: string,
  dbOverride?: DbInstance
): Promise<boolean> {
  await removeFavoriteInRepo(userId, listingId, dbOverride);

  await deleteFavoriteActivityEvent(userId, listingId, dbOverride);

  return true;
}

export async function isListingFavorited(
  userId: string,
  listingId: string,
  dbOverride?: DbInstance
): Promise<boolean> {
  return isFavoritedInRepo(userId, listingId, dbOverride);
}

export async function getUserFavorites(
  userId: string,
  dbOverride?: DbInstance
): Promise<Favorite[]> {
  return findFavoritesByUserId(userId, dbOverride);
}
