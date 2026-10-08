import { and, eq, count } from 'drizzle-orm';
import { getDb } from '../../db';
import { Favorite, favorites } from '../../db/schema/favorites';

type DbInstance = ReturnType<typeof getDb>;

export async function addFavorite(
  userId: string,
  listingId: string,
  dbOverride?: DbInstance
): Promise<Favorite | null> {
  const db = dbOverride || getDb();

  const [inserted] = await db
    .insert(favorites)
    .values({
      userId,
      listingId,
    })
    .onConflictDoNothing({
      target: [favorites.userId, favorites.listingId],
    })
    .returning();

  return inserted || null;
}

export async function removeFavorite(
  userId: string,
  listingId: string,
  dbOverride?: DbInstance
): Promise<boolean> {
  const db = dbOverride || getDb();

  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.listingId, listingId)));

  return true;
}

export async function isFavorited(
  userId: string,
  listingId: string,
  dbOverride?: DbInstance
): Promise<boolean> {
  const db = dbOverride || getDb();

  const [record] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.listingId, listingId)))
    .limit(1);

  return !!record;
}

export async function getFavoriteCount(
  listingId: string,
  dbOverride?: DbInstance
): Promise<number> {
  const db = dbOverride || getDb();

  const [result] = await db
    .select({ count: count() })
    .from(favorites)
    .where(eq(favorites.listingId, listingId));

  return Number(result?.count || 0);
}

export async function findFavoritesByUserId(
  userId: string,
  dbOverride?: DbInstance
): Promise<Favorite[]> {
  const db = dbOverride || getDb();

  return db
    .select()
    .from(favorites)
    .where(eq(favorites.userId, userId));
}
