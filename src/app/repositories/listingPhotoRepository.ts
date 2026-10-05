import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { ListingPhoto, NewListingPhoto, listingPhotos } from '../../db/schema/listingPhotos';

type DbInstance = ReturnType<typeof getDb>;

export async function findPhotosByListingId(
  listingId: string,
  dbOverride?: DbInstance
): Promise<ListingPhoto[]> {
  const db = dbOverride || getDb();
  return db
    .select()
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId))
    .orderBy(asc(listingPhotos.displayOrder), asc(listingPhotos.createdAt));
}

export async function findPhotoById(
  photoId: string,
  dbOverride?: DbInstance
): Promise<ListingPhoto | null> {
  const db = dbOverride || getDb();
  const results = await db.select().from(listingPhotos).where(eq(listingPhotos.id, photoId)).limit(1);
  return results[0] || null;
}

export async function createListingPhoto(
  data: NewListingPhoto,
  dbOverride?: DbInstance
): Promise<ListingPhoto> {
  const db = dbOverride || getDb();
  const results = await db.insert(listingPhotos).values(data).returning();
  return results[0];
}

export async function deleteListingPhoto(
  photoId: string,
  dbOverride?: DbInstance
): Promise<ListingPhoto | null> {
  const db = dbOverride || getDb();
  const results = await db
    .delete(listingPhotos)
    .where(eq(listingPhotos.id, photoId))
    .returning();
  return results[0] || null;
}

export async function countPhotosByListingId(
  listingId: string,
  dbOverride?: DbInstance
): Promise<number> {
  const db = dbOverride || getDb();
  const results = await db
    .select({ count: sql<number>`count(*)` })
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId));
  return Number(results[0]?.count || 0);
}

export async function updatePhotoOrder(
  listingId: string,
  orderedPhotoIds: string[],
  dbOverride?: DbInstance
): Promise<void> {
  const db = dbOverride || getDb();
  for (let index = 0; index < orderedPhotoIds.length; index++) {
    const photoId = orderedPhotoIds[index];
    await db
      .update(listingPhotos)
      .set({ displayOrder: index, updatedAt: new Date() })
      .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, listingId)));
  }
}
