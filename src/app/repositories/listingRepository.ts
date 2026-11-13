import { and, arrayContains, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, notInArray, or, SQL, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { ConditionGrade, ListingStatus } from '../../db/schema/enums';
import { Listing, NewListing, listings } from '../../db/schema/listings';
import { physicalCopies, PhysicalCopy } from '../../db/schema/physicalCopies';
import { releases, Release } from '../../db/schema/releases';
import { profiles, Profile } from '../../db/schema/profiles';
import { listingPhotos } from '../../db/schema/listingPhotos';
import { getVinylFormatPostgresPattern, VinylFormatFilter, WHITE_LABEL_POSTGRES_PATTERN } from '../../domain/releaseFormat';
import { getCanonicalGenreSearchTerms, resolveCanonicalStyle } from '../../domain/releaseMetadata';

type DbInstance = ReturnType<typeof getDb>;

export interface SearchListingsParams {
  q?: string;
  genre?: string;
  style?: string;
  condition?: ConditionGrade;
  minPrice?: number;
  maxPrice?: number;
  status?: ListingStatus;
  sellerId?: string;
  sellerUsername?: string;
  formats?: VinylFormatFilter[];
  whiteLabel?: boolean;
  contentType?: 'music' | 'non_music';
  specialPressing?: boolean;
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

/** Minimal one-listing projection used by the public detail and comments GET routes. */
export interface PublicListingDetailRecord {
  listing: Pick<Listing, 'id' | 'sellerId' | 'price' | 'tradeAvailable' | 'description' | 'status'>;
  physicalCopy: Pick<PhysicalCopy, 'mediaCondition' | 'sleeveCondition' | 'notes' | 'specialPressing' | 'specialPressingCharacteristics' | 'specialPressingDetails'>;
  release: Pick<Release, 'title' | 'artist' | 'label' | 'catalogueNumber' | 'releaseYear' | 'format' | 'genre' | 'styles' | 'canonicalStyles' | 'coverArtUrl' | 'youtubeVideoId' | 'contentType'>;
  seller: Pick<Profile, 'id' | 'username' | 'displayName'>;
}

export interface ListingSearchRecord {
  listing: Pick<Listing, 'id' | 'price' | 'tradeAvailable'>;
  physicalCopy: Pick<PhysicalCopy, 'mediaCondition' | 'sleeveCondition' | 'specialPressing' | 'specialPressingCharacteristics'>;
  release: Pick<Release, 'title' | 'artist' | 'releaseYear' | 'format' | 'coverArtUrl' | 'contentType'>;
  seller: Pick<Profile, 'username' | 'location'>;
  primaryPhotoPath: string | null;
}

/** Narrow joined projection used only by the seller's My Listings page. */
export interface MyListingsRecord {
  listing: Pick<Listing, 'id' | 'status' | 'price' | 'tradeAvailable'>;
  physicalCopy: Pick<PhysicalCopy, 'mediaCondition' | 'sleeveCondition'>;
  release: Pick<Release, 'title' | 'artist' | 'releaseYear' | 'coverArtUrl'>;
}

/** Minimal joined read model for the seller's listing-edit page. */
export interface ListingEditDetailsRecord {
  listing: Pick<Listing, 'id' | 'sellerId' | 'price' | 'tradeAvailable' | 'description'>;
  physicalCopy: Pick<PhysicalCopy, 'id' | 'mediaCondition' | 'sleeveCondition' | 'notes' | 'specialPressing' | 'specialPressingCharacteristics' | 'specialPressingDetails'> | null;
  release: Pick<Release, 'id' | 'title' | 'artist' | 'releaseYear' | 'coverArtUrl' | 'externalSource' | 'externalId' | 'youtubeVideoId' | 'contentType'> | null;
}

/** Minimal joined read model for the authenticated seller's pre-publish Preview page. */
export interface ListingPreviewDetailsRecord {
  listing: Pick<Listing, 'id' | 'status' | 'price' | 'tradeAvailable' | 'description'>;
  physicalCopy: Pick<PhysicalCopy, 'id' | 'mediaCondition' | 'sleeveCondition' | 'specialPressing' | 'specialPressingCharacteristics' | 'specialPressingDetails'> | null;
  release: Pick<Release, 'id' | 'title' | 'artist' | 'label' | 'catalogueNumber' | 'releaseYear' | 'format' | 'coverArtUrl' | 'contentType'> | null;
  seller: Pick<Profile, 'id' | 'username' | 'location'> | null;
}

export interface SearchListingsResult {
  records: ListingSearchRecord[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchListingsOptions {
  /** Skip the separate front-photo lookup when the caller already loads all Dig photos. */
  attachPrimaryPhotoPaths?: boolean;
}

/** Attach the preferred front-cover path with one bounded bulk photo lookup. */
async function attachPrimaryPhotoPaths<T extends { listing: { id: string } }>(
  rows: T[],
  db: DbInstance
): Promise<Array<T & { primaryPhotoPath: string | null }>> {
  if (rows.length === 0) return [];

  const listingIds = rows.map((row) => row.listing.id);
  const photoRecords = await db
    .select({
      listingId: listingPhotos.listingId,
      storagePath: listingPhotos.storagePath,
    })
    .from(listingPhotos)
    .where(and(
      inArray(listingPhotos.listingId, listingIds),
      eq(listingPhotos.role, 'front_cover')
    ))
    .orderBy(asc(listingPhotos.displayOrder));

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

/**
 * Read the one-to-one public listing detail graph in one joined query.
 * Photos and comments deliberately stay separate to avoid row multiplication.
 */
export async function findPublicListingDetailById(
  id: string,
  dbOverride?: DbInstance
): Promise<PublicListingDetailRecord | null> {
  const db = dbOverride || getDb();
  const results = await db
    .select({
      listing: {
        id: listings.id,
        sellerId: listings.sellerId,
        price: listings.price,
        tradeAvailable: listings.tradeAvailable,
        description: listings.description,
        status: listings.status,
      },
      physicalCopy: {
        mediaCondition: physicalCopies.mediaCondition,
        sleeveCondition: physicalCopies.sleeveCondition,
        notes: physicalCopies.notes,
        specialPressing: physicalCopies.specialPressing,
        specialPressingCharacteristics: physicalCopies.specialPressingCharacteristics,
        specialPressingDetails: physicalCopies.specialPressingDetails,
      },
      release: {
        title: releases.title,
        artist: releases.artist,
        label: releases.label,
        catalogueNumber: releases.catalogueNumber,
        releaseYear: releases.releaseYear,
        format: releases.format,
        genre: releases.genre,
        styles: releases.styles,
        canonicalStyles: releases.canonicalStyles,
        coverArtUrl: releases.coverArtUrl,
        youtubeVideoId: releases.youtubeVideoId,
        contentType: releases.contentType,
      },
      seller: {
        id: profiles.id,
        username: profiles.username,
        displayName: profiles.displayName,
      },
    })
    .from(listings)
    .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .innerJoin(profiles, eq(listings.sellerId, profiles.id))
    .where(eq(listings.id, id))
    .limit(1);
  return results[0] || null;
}

/** Read the seller-edit core graph in one joined query without loading the seller profile. */
export async function findListingEditDetailsById(
  id: string,
  dbOverride?: DbInstance
): Promise<ListingEditDetailsRecord | null> {
  const db = dbOverride || getDb();
  const results = await db
    .select({
      listing: {
        id: listings.id,
        sellerId: listings.sellerId,
        price: listings.price,
        tradeAvailable: listings.tradeAvailable,
        description: listings.description,
      },
      physicalCopy: {
        id: physicalCopies.id,
        mediaCondition: physicalCopies.mediaCondition,
        sleeveCondition: physicalCopies.sleeveCondition,
        notes: physicalCopies.notes,
        specialPressing: physicalCopies.specialPressing,
        specialPressingCharacteristics: physicalCopies.specialPressingCharacteristics,
        specialPressingDetails: physicalCopies.specialPressingDetails,
      },
      release: {
        id: releases.id,
        title: releases.title,
        artist: releases.artist,
        releaseYear: releases.releaseYear,
        coverArtUrl: releases.coverArtUrl,
        externalSource: releases.externalSource,
        externalId: releases.externalId,
        youtubeVideoId: releases.youtubeVideoId,
        contentType: releases.contentType,
      },
    })
    .from(listings)
    .leftJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .leftJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .where(eq(listings.id, id))
    .limit(1);

  return results[0] || null;
}

/** Read Preview's listing, copy, release and seller fields in one joined query. */
export async function findListingPreviewDetailsById(
  id: string,
  dbOverride?: DbInstance
): Promise<ListingPreviewDetailsRecord | null> {
  const db = dbOverride || getDb();
  const results = await db
    .select({
      listing: {
        id: listings.id,
        status: listings.status,
        price: listings.price,
        tradeAvailable: listings.tradeAvailable,
        description: listings.description,
      },
      physicalCopy: {
        id: physicalCopies.id,
        mediaCondition: physicalCopies.mediaCondition,
        sleeveCondition: physicalCopies.sleeveCondition,
        specialPressing: physicalCopies.specialPressing,
        specialPressingCharacteristics: physicalCopies.specialPressingCharacteristics,
        specialPressingDetails: physicalCopies.specialPressingDetails,
      },
      release: {
        id: releases.id,
        title: releases.title,
        artist: releases.artist,
        label: releases.label,
        catalogueNumber: releases.catalogueNumber,
        releaseYear: releases.releaseYear,
        format: releases.format,
        coverArtUrl: releases.coverArtUrl,
        contentType: releases.contentType,
      },
      seller: {
        id: profiles.id,
        username: profiles.username,
        location: profiles.location,
      },
    })
    .from(listings)
    .leftJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .leftJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .leftJoin(profiles, eq(listings.sellerId, profiles.id))
    .where(eq(listings.id, id))
    .limit(1);

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

/**
 * Load a seller's My Listings rows with one narrow join instead of re-reading
 * each listing, physical copy, release, and seller profile individually.
 */
export async function findMyListingsBySellerId(
  sellerId: string,
  dbOverride?: DbInstance,
  includeDismissed = false
): Promise<MyListingsRecord[]> {
  const db = dbOverride || getDb();
  return db
    .select({
      listing: {
        id: listings.id,
        status: listings.status,
        price: listings.price,
        tradeAvailable: listings.tradeAvailable,
      },
      physicalCopy: {
        mediaCondition: physicalCopies.mediaCondition,
        sleeveCondition: physicalCopies.sleeveCondition,
      },
      release: {
        title: releases.title,
        artist: releases.artist,
        releaseYear: releases.releaseYear,
        coverArtUrl: releases.coverArtUrl,
      },
    })
    .from(listings)
    .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .where(and(
      eq(listings.sellerId, sellerId),
      includeDismissed ? isNotNull(listings.dismissedAt) : isNull(listings.dismissedAt)
    ));
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

/**
 * Count published listings for a seller directly using the resolved seller profile ID.
 * Avoids joining physical copies, releases, profiles, or querying photos.
 */
export async function countPublishedListingsBySellerId(
  sellerId: string,
  dbOverride?: DbInstance
): Promise<number> {
  const db = dbOverride || getDb();
  const result = await db
    .select({ total: count() })
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), eq(listings.status, 'published')));
  return Number(result[0]?.total || 0);
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
): Promise<ListingSearchRecord[]> {
  const db = dbOverride || getDb();
  const safeLimit = Number.isFinite(limit) ? Math.min(6, Math.max(1, Math.floor(limit))) : 6;
  const exclusion = excludedListingIds.length > 0
    ? [notInArray(listings.id, excludedListingIds)]
    : [];

  const selectRange = (afterCursor: boolean, rangeLimit: number) => db
    .select({
      listing: {
        id: listings.id,
        price: listings.price,
        tradeAvailable: listings.tradeAvailable,
      },
      physicalCopy: {
        mediaCondition: physicalCopies.mediaCondition,
        sleeveCondition: physicalCopies.sleeveCondition,
        specialPressing: physicalCopies.specialPressing,
        specialPressingCharacteristics: physicalCopies.specialPressingCharacteristics,
      },
      release: {
        title: releases.title,
        artist: releases.artist,
        releaseYear: releases.releaseYear,
        format: releases.format,
        coverArtUrl: releases.coverArtUrl,
        contentType: releases.contentType,
      },
      seller: {
        username: profiles.username,
        location: profiles.location,
      },
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

/** Search listing cards with a narrow projection and an optional single batched primary-photo lookup. */
export async function searchListings(
  params: SearchListingsParams,
  dbOverride?: DbInstance,
  options: SearchListingsOptions = {}
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
    const genre = params.genre.trim();
    const legacyGenreExpression = sql`(' ' || regexp_replace(regexp_replace(lower(coalesce(${releases.genre}, '')), '&', ' and ', 'g'), '[^a-z0-9]+', ' ', 'g') || ' ')`;
    const legacyGenreMatches = getCanonicalGenreSearchTerms(genre).map((term) =>
      sql`${legacyGenreExpression} LIKE ${`% ${term} %`}`
    );
    conditions.push(or(
      arrayContains(releases.canonicalGenres, [genre]),
      ilike(releases.genre, `%${genre}%`),
      ...legacyGenreMatches
    )!);
  }

  // Style filter
  if (params.style && params.style.trim()) {
    const style = params.style.trim();
    const canonical = resolveCanonicalStyle(style) || style;
    conditions.push(or(
      arrayContains(releases.canonicalStyles, [canonical]),
      arrayContains(releases.styles, [style]),
      arrayContains(releases.styles, [canonical]),
      sql`exists (select 1 from unnest(${releases.styles}) s where s ilike ${style})`
    )!);
  }

  // Format quick filters use explicit terms in legacy free-text metadata. LP is
  // an album/long-play characteristic; 12-inch and 7-inch are physical diameters.
  if (params.formats && params.formats.length > 0) {
    conditions.push(or(...params.formats.map((format) =>
      or(
        arrayContains(releases.formatCharacteristics, [format]),
        sql`${releases.format} ~* ${getVinylFormatPostgresPattern(format)}`
      )!
    ))!);
  }

  // White-label is a release characteristic, not a physical diameter. Match
  // only explicit markers in the release label field; do not guess from title.
  if (params.whiteLabel) {
    conditions.push(sql`${releases.label} ~* ${WHITE_LABEL_POSTGRES_PATTERN}`);
  }

  // Shared release content type and seller-confirmed physical-copy characteristics.
  if (params.contentType) conditions.push(eq(releases.contentType, params.contentType));
  if (params.specialPressing) conditions.push(eq(physicalCopies.specialPressing, true));

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
      listing: {
        id: listings.id,
        price: listings.price,
        tradeAvailable: listings.tradeAvailable,
      },
      physicalCopy: {
        mediaCondition: physicalCopies.mediaCondition,
        sleeveCondition: physicalCopies.sleeveCondition,
        specialPressing: physicalCopies.specialPressing,
        specialPressingCharacteristics: physicalCopies.specialPressingCharacteristics,
      },
      release: {
        title: releases.title,
        artist: releases.artist,
        releaseYear: releases.releaseYear,
        format: releases.format,
        coverArtUrl: releases.coverArtUrl,
        contentType: releases.contentType,
      },
      seller: {
        username: profiles.username,
        location: profiles.location,
      },
    })
    .from(listings)
    .innerJoin(physicalCopies, eq(listings.physicalCopyId, physicalCopies.id))
    .innerJoin(releases, eq(physicalCopies.releaseId, releases.id))
    .innerJoin(profiles, eq(listings.sellerId, profiles.id))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const records = options.attachPrimaryPhotoPaths === false
    ? rows.map((row) => ({ ...row, primaryPhotoPath: null }))
    : await attachPrimaryPhotoPaths(rows, db);

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


/** Delete only an archived listing that is still owned by the requesting seller. */
export async function deleteArchivedListingByOwner(
  id: string,
  sellerId: string,
  dbOverride?: DbInstance
): Promise<Listing | null> {
  const db = dbOverride || getDb();
  const results = await db.delete(listings).where(and(
    eq(listings.id, id),
    eq(listings.sellerId, sellerId),
    eq(listings.status, 'archived')
  )).returning();
  return results[0] || null;
}

/** Count the remaining listings attached to a physical copy before cleaning it up. */
export async function countListingsByPhysicalCopyId(
  physicalCopyId: string,
  dbOverride?: DbInstance
): Promise<number> {
  const db = dbOverride || getDb();
  const results = await db.select({ total: count() })
    .from(listings)
    .where(eq(listings.physicalCopyId, physicalCopyId));
  return Number(results[0]?.total || 0);
}
