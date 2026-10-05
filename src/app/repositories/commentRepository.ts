import { eq, asc } from 'drizzle-orm';
import { getDb } from '../../db';
import { comments, Comment, NewComment } from '../../db/schema/comments';
import { profiles, Profile } from '../../db/schema/profiles';

type DbInstance = ReturnType<typeof getDb>;

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export async function findCommentsByListingId(
  listingId: string,
  dbOverride?: DbInstance
): Promise<CommentWithAuthor[]> {
  const db = dbOverride || getDb();

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
    .orderBy(asc(comments.createdAt));

  return rows.map((row) => ({
    ...row.comment,
    author: row.author,
  }));
}

export async function createComment(
  data: NewComment,
  dbOverride?: DbInstance
): Promise<Comment> {
  const db = dbOverride || getDb();
  const results = await db.insert(comments).values(data).returning();
  return results[0];
}
