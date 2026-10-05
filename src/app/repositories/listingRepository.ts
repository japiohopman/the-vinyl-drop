import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db';
import { ListingStatus } from '../../db/schema/enums';
import { Listing, NewListing, listings } from '../../db/schema/listings';

type DbInstance = ReturnType<typeof getDb>;

export async function findListingById(id: string, dbOverride?: DbInstance): Promise<Listing | null> {
  const db = dbOverride || getDb();
  const results = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  return results[0] || null;
}

export async function findActiveListingByPhysicalCopyId(
  physicalCopyId: string,
  dbOverride?: DbInstance
): Promise<Listing | null> {
  const db = dbOverride || getDb();
  const results = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.physicalCopyId, physicalCopyId),
        inArray(listings.status, ['published', 'reserved'])
      )
    )
    .limit(1);
  return results[0] || null;
}

export async function findListingsBySellerId(sellerId: string, dbOverride?: DbInstance): Promise<Listing[]> {
  const db = dbOverride || getDb();
  return db.select().from(listings).where(eq(listings.sellerId, sellerId));
}

export async function createListing(data: NewListing, dbOverride?: DbInstance): Promise<Listing> {
  const db = dbOverride || getDb();
  const results = await db.insert(listings).values(data).returning();
  return results[0];
}

export async function updateListing(
  id: string,
  data: Partial<NewListing>,
  dbOverride?: DbInstance
): Promise<Listing | null> {
  const db = dbOverride || getDb();
  const results = await db
    .update(listings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(listings.id, id))
    .returning();
  return results[0] || null;
}

export async function updateListingStatus(
  id: string,
  status: ListingStatus,
  dbOverride?: DbInstance
): Promise<Listing | null> {
  const db = dbOverride || getDb();
  const results = await db
    .update(listings)
    .set({ status, updatedAt: new Date() })
    .where(eq(listings.id, id))
    .returning();
  return results[0] || null;
}
