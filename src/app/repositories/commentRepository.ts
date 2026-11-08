import { and, eq, desc, or } from 'drizzle-orm';
import { getDb } from '../../db';
import { comments, Comment, NewComment } from '../../db/schema/comments';
import type { Listing } from '../../db/schema/listings';
import { listings } from '../../db/schema/listings';
import { profiles, Profile } from '../../db/schema/profiles';

type DbInstance = ReturnType<typeof getDb>;

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export async function findCommentsByListingId(
  listingId: string,
  options: { limit?: number } = {},
  dbOverride?: DbInstance
): Promise<CommentWithAuthor[]> {
  const db = dbOverride || getDb();
  const limit = options.limit !== undefined ? Math.min(Math.max(1, options.limit), 50) : 50;

  // Retrieve the N most recent comments (ordered DESC by createdAt)
  const rows = await db
    .select({
      comment: comments,
      author: {
        id: profiles.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      },
    })
    .from(comments)
    .innerJoin(profiles, eq(comments.authorId, profiles.id))
    .where(eq(comments.listingId, listingId))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  // Map and reorder chronologically (ASC) for display
  const items = rows.map((row) => ({
    ...row.comment,
    author: row.author,
  }));

  return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Read current listing visibility and its comments in one statement.
 *
 * The visibility predicate is applied to the optional comment join, so the
 * listing row remains available for the service to enforce the current
 * published-or-owner rule without a second SELECT or a stale status snapshot.
 */
export async function findCommentsWithCurrentListingVisibility(
  listingId: string,
  requestingUserId?: string,
  options: { limit?: number } = {},
  dbOverride?: DbInstance
): Promise<{
  listing: Pick<Listing, 'id' | 'status' | 'sellerId'>;
  comments: CommentWithAuthor[];
} | null> {
  const db = dbOverride || getDb();
  const limit = options.limit !== undefined ? Math.min(Math.max(1, options.limit), 50) : 50;
  const visibleToRequester = requestingUserId
    ? or(eq(listings.status, 'published'), eq(listings.sellerId, requestingUserId))!
    : eq(listings.status, 'published');

  const rows = await db
    .select({
      listing: {
        id: listings.id,
        status: listings.status,
        sellerId: listings.sellerId,
      },
      comment: {
        id: comments.id,
        listingId: comments.listingId,
        authorId: comments.authorId,
        content: comments.content,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      },
      author: {
        id: profiles.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      },
    })
    .from(listings)
    .leftJoin(comments, and(
      eq(comments.listingId, listings.id),
      visibleToRequester
    ))
    .leftJoin(profiles, eq(comments.authorId, profiles.id))
    .where(eq(listings.id, listingId))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  if (rows.length === 0) return null;

  const items = rows.flatMap((row) => row.comment && row.author
    ? [{ ...row.comment, author: row.author }]
    : []);

  return {
    listing: rows[0].listing,
    comments: items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  };
}

export async function createComment(
  data: NewComment,
  dbOverride?: DbInstance
): Promise<Comment> {
  const db = dbOverride || getDb();
  const results = await db.insert(comments).values(data).returning();
  return results[0];
}
