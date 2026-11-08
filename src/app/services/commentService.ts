import { getDb } from '../../db';
import type { Listing } from '../../db/schema/listings';
import { createCommentSchema } from '../../validators/comment';
import {
  CommentWithAuthor,
  createComment as createCommentInRepo,
  findCommentsByListingId,
  findCommentsWithCurrentListingVisibility,
} from '../repositories/commentRepository';
import { findListingById } from '../repositories/listingRepository';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';
import { Comment } from '../../db/schema/comments';
import { recordCommentCreatedEvent } from './activityService';
import { emitNotificationEvent } from './notificationHooks';

type DbInstance = ReturnType<typeof getDb>;

export async function getListingComments(
  listingId: string,
  requestingUserId?: string,
  dbOverride?: DbInstance
): Promise<CommentWithAuthor[]> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  // Public visibility boundary:
  // Non-published listings can only be viewed (and their comments read) by the seller.
  if (listing.status !== 'published' && listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You do not have access to comments on this listing');
  }

  return findCommentsByListingId(listingId, { limit: 50 }, dbOverride);
}

/**
 * Load comments after a detail query has already resolved the listing. The ID
 * match and published-or-owner check remain in the service layer, but no second
 * listing SELECT is needed.
 */
export async function getListingCommentsForResolvedListing(
  expectedListingId: string,
  listing: Pick<Listing, 'id' | 'status' | 'sellerId'>,
  requestingUserId?: string,
  dbOverride?: DbInstance
): Promise<CommentWithAuthor[]> {
  // PostgreSQL UUID values are case-insensitive; compare their canonical text
  // representation rather than treating an uppercase URL as a different ID.
  if (listing.id.toLowerCase() !== expectedListingId.toLowerCase()) {
    throw new NotFoundError('Listing not found');
  }

  // Fetch the current listing status and comments in the same SQL statement.
  // This closes the race where a listing is unpublished after detail resolution
  // but before comments are read, without reintroducing a second listing SELECT.
  const result = await findCommentsWithCurrentListingVisibility(
    expectedListingId,
    requestingUserId,
    { limit: 50 },
    dbOverride
  );
  if (!result) {
    throw new NotFoundError('Listing not found');
  }

  if (result.listing.status !== 'published' && result.listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You do not have access to comments on this listing');
  }

  return result.comments;
}

export async function addComment(
  listingId: string,
  authorId: string,
  contentInput: string,
  dbOverride?: DbInstance
): Promise<Comment> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  // Comment posting boundary:
  // Non-published listings can only receive comments from the seller.
  if (listing.status !== 'published' && listing.sellerId !== authorId) {
    throw new AuthorizationError('Cannot comment on an unpublished listing');
  }

  const parseResult = createCommentSchema.safeParse({ content: contentInput });
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid comment: ${msg}`);
  }

  const comment = await createCommentInRepo(
    {
      listingId,
      authorId,
      content: parseResult.data.content,
    },
    dbOverride
  );

  await recordCommentCreatedEvent(authorId, listingId, comment.id, dbOverride);

  if (listing.sellerId !== authorId) {
    await emitNotificationEvent({
      type: 'comment.created',
      actorId: authorId,
      recipientId: listing.sellerId,
      listingId,
      commentId: comment.id,
      createdAt: new Date(),
    });
  }

  return comment;
}
