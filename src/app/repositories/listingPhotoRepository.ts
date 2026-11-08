import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { ListingPhoto, NewListingPhoto, listingPhotos } from '../../db/schema/listingPhotos';
import { ListingPhotoRole } from '../../domain/listingPhotoRole';

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

export type PublicListingPhotoRecord = Pick<
  ListingPhoto,
  'storagePath' | 'role' | 'displayOrder' | 'altText'
>;

/** Fetch only the ordered fields required to render public listing photography. */
export async function findPublicListingPhotosByListingId(
  listingId: string,
  dbOverride?: DbInstance
): Promise<PublicListingPhotoRecord[]> {
  const db = dbOverride || getDb();
  return db
    .select({
      storagePath: listingPhotos.storagePath,
      role: listingPhotos.role,
      displayOrder: listingPhotos.displayOrder,
      altText: listingPhotos.altText,
    })
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

export interface DigPhotoRecord {
  listingId: string;
  storagePath: string;
  role: ListingPhotoRole;
  displayOrder: number;
  altText: string | null;
}

/** Fetch only the public-facing metadata needed to render Dig and desktop listing cards. */
export async function findDigPhotosByListingIds(
  listingIds: string[],
  dbOverride?: DbInstance
): Promise<DigPhotoRecord[]> {
  if (listingIds.length === 0) return [];
  const db = dbOverride || getDb();
  return db
    .select({
      listingId: listingPhotos.listingId,
      storagePath: listingPhotos.storagePath,
      role: listingPhotos.role,
      displayOrder: listingPhotos.displayOrder,
      altText: listingPhotos.altText,
    })
    .from(listingPhotos)
    .where(inArray(listingPhotos.listingId, listingIds))
    .orderBy(asc(listingPhotos.listingId), asc(listingPhotos.displayOrder), asc(listingPhotos.createdAt));
}

export async function findPhotosByListingIds(
  listingIds: string[],
  dbOverride?: DbInstance
): Promise<ListingPhoto[]> {
  if (listingIds.length === 0) return [];
  const db = dbOverride || getDb();
  return db
    .select()
    .from(listingPhotos)
    .where(inArray(listingPhotos.listingId, listingIds))
    .orderBy(asc(listingPhotos.listingId), asc(listingPhotos.displayOrder), asc(listingPhotos.createdAt));
}

export async function updateListingPhotoEditor(
  listingId: string,
  photoId: string,
  expectedStoragePath: string,
  storagePath: string,
  editorState: ListingPhoto['editorState'],
  altText: string | null,
  dbOverride?: DbInstance
): Promise<ListingPhoto | null> {
  const db = dbOverride || getDb();
  const results = await db
    .update(listingPhotos)
    .set({ storagePath, editorState: editorState ?? null, altText, updatedAt: new Date() })
    .where(and(
      eq(listingPhotos.listingId, listingId),
      eq(listingPhotos.id, photoId),
      eq(listingPhotos.storagePath, expectedStoragePath)
    ))
    .returning();
  return results[0] || null;
}

/**
 * Repoint a listing photo only when its stored URL is still the snapshot URL.
 * This compare-and-set prevents a failed-delete rollback from overwriting a
 * concurrent photo edit that has already moved the row to a newer URL.
 */
export async function updateListingPhotoStoragePath(
  listingId: string,
  photoId: string,
  expectedStoragePath: string,
  storagePath: string,
  dbOverride?: DbInstance
): Promise<ListingPhoto | null> {
  const db = dbOverride || getDb();
  const results = await db
    .update(listingPhotos)
    .set({ storagePath, updatedAt: new Date() })
    .where(and(
      eq(listingPhotos.listingId, listingId),
      eq(listingPhotos.id, photoId),
      eq(listingPhotos.storagePath, expectedStoragePath)
    ))
    .returning();
  return results[0] || null;
}

export async function updateListingPhotoSource(
  listingId: string,
  photoId: string,
  sourceStoragePath: string,
  sourceIsLegacy: boolean,
  dbOverride?: DbInstance
): Promise<ListingPhoto | null> {
  const db = dbOverride || getDb();
  const results = await db
    .update(listingPhotos)
    .set({ sourceStoragePath, sourceIsLegacy, updatedAt: new Date() })
    .where(and(eq(listingPhotos.listingId, listingId), eq(listingPhotos.id, photoId)))
    .returning();
  return results[0] || null;
}

export async function updateListingPhotoRole(
  listingId: string,
  photoId: string,
  role: ListingPhotoRole,
  dbOverride?: DbInstance
): Promise<ListingPhoto | null> {
  const db = dbOverride || getDb();
  const results = await db
    .update(listingPhotos)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(listingPhotos.listingId, listingId), eq(listingPhotos.id, photoId)))
    .returning();
  return results[0] || null;
}
