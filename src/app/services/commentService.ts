import { getDb } from '../../db';
import { createCommentSchema } from '../../validators/comment';
import {
  CommentWithAuthor,
  createComment as createCommentInRepo,
  findCommentsByListingId,
} from '../repositories/commentRepository';
import { findListingById } from '../repositories/listingRepository';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';
import { Comment } from '../../db/schema/comments';

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

  return createCommentInRepo(
    {
      listingId,
      authorId,
      content: parseResult.data.content,
    },
    dbOverride
  );
}
