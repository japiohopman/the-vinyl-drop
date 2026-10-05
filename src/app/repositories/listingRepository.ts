import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, SQL } from 'drizzle-orm';
import { getDb } from '../../db';
import { ConditionGrade, ListingStatus } from '../../db/schema/enums';
import { Listing, NewListing, listings } from '../../db/schema/listings';
import { physicalCopies, PhysicalCopy } from '../../db/schema/physicalCopies';
import { releases, Release } from '../../db/schema/releases';
import { profiles, Profile } from '../../db/schema/profiles';
import { listingPhotos } from '../../db/schema/listingPhotos';

type DbInstance = ReturnType<typeof getDb>;

export interface SearchListingsParams {
  q?: string;
  genre?: string;
  condition?: ConditionGrade;
  minPrice?: number;
  maxPrice?: number;
  status?: ListingStatus;
  sellerId?: string;
  sellerUsername?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'title_asc' | 'artist_asc';
  page?: number;
  limit?: number;
}

export interface JoinedListingRecord {
  listing: Listing;
  physicalCopy: PhysicalCopy;
  release: Release;
  seller: Profile;
  primaryPhotoPath: string | null;
}

export interface SearchListingsResult {
  records: JoinedListingRecord[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

export async function searchListings(
  params: SearchListingsParams,
  dbOverride?: DbInstance
): Promise<SearchListingsResult> {
  const db = dbOverride || getDb();
  const conditions: SQL[] = [];

  // Filter status (defaults to published)
  if (params.status) {
    conditions.push(eq(listings.status, params.status));
  } else {
    conditions.push(eq(listings.status, 'published'));
  }

  // Filter seller ID
  if (params.sellerId) {
    conditions.push(eq(listings.sellerId, params.sellerId));
  }

  // Filter seller username
  if (params.sellerUsername) {
    conditions.push(eq(profiles.username, params.sellerUsername));
  }

  // Keyword text search (PostgreSQL ILIKE over release artist, title, label, cat#, and description)
  if (params.q && params.q.trim()) {
    const queryTerm = `%${params.q.trim()}%`;
    conditions.push(
      or(
        ilike(releases.artist, queryTerm),
        ilike(releases.title, queryTerm),
        ilike(releases.label, queryTerm),
        ilike(releases.catalogueNumber, queryTerm),
        ilike(listings.description, queryTerm)
      )!
    );
  }

  // Genre filter
  if (params.genre && params.genre.trim()) {
    conditions.push(ilike(releases.genre, `%${params.genre.trim()}%`));
  }

  // Condition filter
  if (params.condition) {
    conditions.push(
      or(
        eq(physicalCopies.mediaCondition, params.condition),
        eq(physicalCopies.sleeveCondition, params.condition)
      )!
    );
  }

  // Price bounds (in integer minor units)
  if (params.minPrice !== undefined && params.minPrice !== null && !isNaN(params.minPrice)) {
    conditions.push(gte(listings.price, params.minPrice));
  }
  if (params.maxPrice !== undefined && params.maxPrice !== null && !isNaN(params.maxPrice)) {
    conditions.push(lte(listings.price, params.maxPrice));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Sorting
  let orderBy: SQL;
  switch (params.sort) {
    case 'price_asc':
      orderBy = asc(listings.price);
      break;
    case 'price_desc':
      orderBy = desc(listings.price);
      break;
    case 'title_asc':
      orderBy = asc(releases.title);
      break;
    case 'artist_asc':
      orderBy = asc(releases.artist);
      break;
    case 'newest':
    default:
      orderBy = desc(listings.createdAt);
      break;
  }

  // Count total matching items
  const countResult = await db
    .select({ total: count() })
    .from(listings)
    .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .innerJoin(profiles, eq(listings.sellerId, profiles.id))
    .where(whereClause);

  const totalCount = Number(countResult[0]?.total || 0);

  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 12));
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  if (totalCount === 0) {
    return {
      records: [],
      totalCount: 0,
      page,
      limit,
      totalPages: 1,
    };
  }

  const rows = await db
    .select({
      listing: listings,
      physicalCopy: physicalCopies,
      release: releases,
      seller: profiles,
    })
    .from(listings)
    .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .innerJoin(profiles, eq(listings.sellerId, profiles.id))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // Bulk query primary photos for returned listing IDs
  const listingIds = rows.map((r) => r.listing.id);
  const photoRecords =
    listingIds.length > 0
      ? await db
          .select()
          .from(listingPhotos)
          .where(inArray(listingPhotos.listingId, listingIds))
          .orderBy(asc(listingPhotos.displayOrder))
      : [];

  const primaryPhotoMap = new Map<string, string>();
  for (const photo of photoRecords) {
    if (!primaryPhotoMap.has(photo.listingId)) {
      primaryPhotoMap.set(photo.listingId, photo.storagePath);
    }
  }

  const records: JoinedListingRecord[] = rows.map((row) => ({
    ...row,
    primaryPhotoPath: primaryPhotoMap.get(row.listing.id) || null,
  }));

  return {
    records,
    totalCount,
    page,
    limit,
    totalPages,
  };
}
