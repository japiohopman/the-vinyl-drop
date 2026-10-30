import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, notInArray, or, SQL, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { ConditionGrade, ListingStatus } from '../../db/schema/enums';
import { Listing, NewListing, listings } from '../../db/schema/listings';
import { physicalCopies, PhysicalCopy } from '../../db/schema/physicalCopies';
import { releases, Release } from '../../db/schema/releases';
import { profiles, Profile } from '../../db/schema/profiles';
import { listingPhotos } from '../../db/schema/listingPhotos';
import { getVinylFormatPostgresPattern, VinylFormatFilter, WHITE_LABEL_POSTGRES_PATTERN } from '../../domain/releaseFormat';

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
  formats?: VinylFormatFilter[];
  whiteLabel?: boolean;
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

type JoinedListingRow = Omit<JoinedListingRecord, 'primaryPhotoPath'>;

/** Attach the preferred front-cover path with one bounded bulk photo lookup. */
async function attachPrimaryPhotoPaths(
  rows: JoinedListingRow[],
  db: DbInstance
): Promise<JoinedListingRecord[]> {
  if (rows.length === 0) return [];

  const listingIds = rows.map((row) => row.listing.id);
  const photoRecords = await db
    .select()
    .from(listingPhotos)
    .where(inArray(listingPhotos.listingId, listingIds))
    .orderBy(
      sql`case when ${listingPhotos.role} = 'front_cover' then 0 else 1 end`,
      asc(listingPhotos.displayOrder)
    );

  const primaryPhotoMap = new Map<string, string>();
  for (const photo of photoRecords) {
    if (!primaryPhotoMap.has(photo.listingId)) {
      primaryPhotoMap.set(photo.listingId, photo.storagePath);
    }
  }

  return rows.map((row) => ({
    ...row,
    primaryPhotoPath: primaryPhotoMap.get(row.listing.id) || null,
  }));
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

export async function findListingsBySellerId(
  sellerId: string,
  dbOverride?: DbInstance,
  includeDismissed = false
): Promise<Listing[]> {
  const db = dbOverride || getDb();
  return db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.sellerId, sellerId),
        includeDismissed ? isNotNull(listings.dismissedAt) : isNull(listings.dismissedAt)
      )
    );
}

export async function findPublishedListingsBySellerId(
  sellerId: string,
  dbOverride?: DbInstance
): Promise<Listing[]> {
  const db = dbOverride || getDb();
  return db
    .select()
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), eq(listings.status, 'published')));
}

export async function findRecentPublishedListings(
  limit = 10,
  dbOverride?: DbInstance
): Promise<Listing[]> {
  const db = dbOverride || getDb();
  return db
    .select()
    .from(listings)
    .where(eq(listings.status, 'published'))
    .orderBy(desc(listings.createdAt))
    .limit(limit);
}

/**
 * Select a rotating, bounded window of public listings without a table-wide random sort.
 *
 * Listing IDs are random UUIDs. Starting an ordered primary-key range scan at a fresh
 * random UUID gives each request a different catalogue slice; a second lower-ID range
 * wraps around when the first segment contains fewer than the requested number.
 * The ranges are disjoint, status is always restricted to published, and recent-feed
 * IDs can be excluded so the two Home sections stay distinct.
 */
export async function findHomeDiscoveryListingsByCursor(
  cursorId: string,
  limit = 6,
  excludedListingIds: string[] = [],
  dbOverride?: DbInstance
): Promise<JoinedListingRecord[]> {
  const db = dbOverride || getDb();
  const safeLimit = Number.isFinite(limit) ? Math.min(6, Math.max(1, Math.floor(limit))) : 6;
  const exclusion = excludedListingIds.length > 0
    ? [notInArray(listings.id, excludedListingIds)]
    : [];

  const selectRange = (afterCursor: boolean, rangeLimit: number) => db
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
    .where(and(
      eq(listings.status, 'published'),
      ...exclusion,
      afterCursor ? gte(listings.id, cursorId) : lt(listings.id, cursorId)
    ))
    .orderBy(asc(listings.id))
    .limit(rangeLimit);

  const firstRange = await selectRange(true, safeLimit);
  const remaining = safeLimit - firstRange.length;
  const wrappedRange = remaining > 0 ? await selectRange(false, remaining) : [];

  return attachPrimaryPhotoPaths([...firstRange, ...wrappedRange], db);
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
    conditions.push(eq(sql`LOWER(${profiles.username})`, params.sellerUsername.toLowerCase()));
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

  // Format quick filters use explicit terms in legacy free-text metadata. LP is
  // an album/long-play characteristic; 12-inch and 7-inch are physical diameters.
  if (params.formats && params.formats.length > 0) {
    conditions.push(or(...params.formats.map((format) =>
      sql`${releases.format} ~* ${getVinylFormatPostgresPattern(format)}`
    ))!);
  }

  // White-label is a release characteristic, not a physical diameter. Match
  // only explicit markers in the release label field; do not guess from title.
  if (params.whiteLabel) {
    conditions.push(sql`${releases.label} ~* ${WHITE_LABEL_POSTGRES_PATTERN}`);
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
  let orderBy: SQL[];
  switch (params.sort) {
    case 'price_asc':
      orderBy = [
        sql`CASE WHEN ${listings.price} IS NULL THEN 1 ELSE 0 END ASC`,
        asc(listings.price),
        desc(listings.createdAt),
      ];
      break;
    case 'price_desc':
      orderBy = [
        sql`CASE WHEN ${listings.price} IS NULL THEN 1 ELSE 0 END ASC`,
        desc(listings.price),
        desc(listings.createdAt),
      ];
      break;
    case 'title_asc':
      orderBy = [asc(releases.title), desc(listings.createdAt)];
      break;
    case 'artist_asc':
      orderBy = [asc(releases.artist), desc(listings.createdAt)];
      break;
    case 'newest':
    default:
      orderBy = [desc(listings.createdAt)];
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
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const records = await attachPrimaryPhotoPaths(rows, db);

  return {
    records,
    totalCount,
    page,
    limit,
    totalPages,
  };
}


/** Only show the White label shortcut when published catalog data has an explicit label marker. */
export async function hasExplicitWhiteLabelInventory(dbOverride?: DbInstance): Promise<boolean> {
  const db = dbOverride || getDb();
  const result = await db
    .select({ total: count() })
    .from(listings)
    .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .where(and(eq(listings.status, 'published'), sql`${releases.label} ~* ${WHITE_LABEL_POSTGRES_PATTERN}`));
  return Number(result[0]?.total || 0) > 0;
}
