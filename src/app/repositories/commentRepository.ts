import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../db';
import { comments, Comment, NewComment } from '../../db/schema/comments';
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

export async function createComment(
  data: NewComment,
  dbOverride?: DbInstance
): Promise<Comment> {
  const db = dbOverride || getDb();
  const results = await db.insert(comments).values(data).returning();
  return results[0];
}
