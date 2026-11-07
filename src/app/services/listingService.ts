import crypto from 'crypto';
import { getDb } from '../../db';
import { ListingStatus } from '../../db/schema/enums';
import { ListingPhoto } from '../../db/schema/listingPhotos';
import { ListingPhotoRole } from '../../domain/listingPhotoRole';
import { MAX_PHOTOS_PER_LISTING } from '../../domain/listingPhotoLimits';
import type { ListingPhotoEditorState } from '../../domain/listingPhotoEditor';
import { listingPhotoEditorStateSchema } from '../../validators/listingPhotoEditor';
import { resolveDigArtwork, DigArtworkFace, DigPhotoCandidate } from '../../domain/digExperience';
import { Listing } from '../../db/schema/listings';
import { PhysicalCopy } from '../../db/schema/physicalCopies';
import { Profile } from '../../db/schema/profiles';
import { Release } from '../../db/schema/releases';
import { isTerminalListingStatus, validateListingTransition } from '../../domain/listingLifecycle';
import {
  CreateListingFromReleaseInput,
  createListingFromReleaseSchema,
  CreateListingInput,
  createListingSchema,
  parsePriceEurToCents,
  reorderPhotosSchema,
  listingPhotoAltTextSchema,
  listingPhotoRoleSchema,
  newListingPhotoRoleSchema,
  UpdateListingDetailsInput,
  updateListingDetailsSchema,
} from '../../validators/listing';
import {
  countPhotosByListingId,
  createListingPhoto,
  deleteListingPhoto,
  findPhotoById,
  findPhotosByListingId,
  findDigPhotosByListingIds,
  updateListingPhotoEditor,
  updateListingPhotoStoragePath,
  updateListingPhotoSource,
  updateListingPhotoRole as updatePhotoRoleInRepo,
  updatePhotoOrder,
} from '../repositories/listingPhotoRepository';
import {
  createListing as createListingInRepo,
  findListingById,
  findListingsBySellerId,
  findPublishedListingsBySellerId,
  findRecentPublishedListings as findRecentInRepo,
  findHomeDiscoveryListingsByCursor as findHomeDiscoveryInRepo,
  JoinedListingRecord,
  ListingSearchRecord,
  searchListings,
  hasExplicitWhiteLabelInventory as hasWhiteLabelInRepo,
  SearchListingsParams,
  updateListing as updateListingInRepo,
  updateListingStatus as updateStatusInRepo,
  deleteArchivedListingByOwner,
  countListingsByPhysicalCopyId,
} from '../repositories/listingRepository';
import {
  createPhysicalCopy,
  findPhysicalCopyById,
  updatePhysicalCopy,
  deletePhysicalCopy,
} from '../repositories/physicalCopyRepository';
import { findProfileById } from '../repositories/profileRepository';
import { findReleaseById } from '../repositories/releaseRepository';
import { ProcessedImage, preserveListingPhotoSource, processAndValidateImage, readImageDimensions } from '../utils/imageProcessor';
import {
  deleteListingPhotoFromStorage,
  restoreListingPhotoToStorage,
  downloadListingPhotoFromStorage,
  getPhotoPublicUrl,
  StorageOptions,
  uploadListingPhotoToStorage,
  uploadListingPhotoSourceToStorage,
  downloadListingPhotoSourceFromStorage,
  deleteListingPhotoSourceFromStorage,
  restoreListingPhotoSourceToStorage,
  listingPhotoSourceStoragePath,
  listingPhotoStoragePath,
} from './storageService';
import { recordOrphanedStorageObject } from '../repositories/orphanRepository';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';
import { buildListingCardViewModel, ListingCardViewModel, formatPrice } from '../view-models/listingCardViewModel';
import { recordListingPublishedEvent } from './activityService';

type DbInstance = ReturnType<typeof getDb>;

export type ListingPhotoWithUrl = Omit<ListingPhoto, 'sourceStoragePath'> & {
  publicUrl: string;
};

/** Private Storage paths must never be passed into EJS or public listing view models. */
function listingPhotoWithPublicUrl(photo: ListingPhoto): ListingPhotoWithUrl {
  const { sourceStoragePath, ...safePhoto } = photo;
  // Deliberately consume the value only to omit it from the public view model.
  void sourceStoragePath;
  return {
    ...safePhoto,
    publicUrl: getPhotoPublicUrl(photo.storagePath),
  };
}

function parseEditorState(input: unknown): ListingPhotoEditorState | null {
  if (input === undefined || input === null || input === '') return null;
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new ValidationError('The photo edit recipe is invalid. Please reopen the editor and try again.');
    }
  }
  const parsed = listingPhotoEditorStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('The photo edit recipe is invalid. Please reopen the editor and try again.');
  }
  return parsed.data;
}

async function recordPhotoStorageOrphan(
  listingId: string,
  photoId: string,
  storagePath: string,
  reason: string,
  dbOverride?: DbInstance
): Promise<void> {
  try {
    await recordOrphanedStorageObject({ listingId, photoId, storagePath, reason }, dbOverride);
  } catch {
    console.error(JSON.stringify({
      event: 'storage_orphan_unresolved',
      reason,
      listingId,
      photoId,
    }));
  }
}

/**
 * Restores a deleted photo snapshot and compare-and-sets its database URL when
 * byte differences require a fresh immutable Storage path. If the photo row
 * changed or disappeared meanwhile, the unreferenced restored object is
 * recorded for cleanup instead of overwriting the concurrent photo state.
 */
async function restoreListingPhotoSnapshot(
  listingId: string,
  photoId: string,
  expectedStoragePath: string,
  displayBuffer: Buffer,
  dbOverride: DbInstance | undefined,
  storageOptions: StorageOptions | undefined,
  orphanReason: string
): Promise<void> {
  const restoredStoragePath = await restoreListingPhotoToStorage(
    expectedStoragePath,
    displayBuffer,
    storageOptions
  );
  if (restoredStoragePath === expectedStoragePath) return;

  let updated: ListingPhoto | null = null;
  try {
    updated = await updateListingPhotoStoragePath(
      listingId,
      photoId,
      expectedStoragePath,
      restoredStoragePath,
      dbOverride
    );
  } catch {
    // The orphan record below preserves the new object if the compare-and-set
    // cannot be completed because the database is unavailable.
  }

  if (!updated) {
    await recordPhotoStorageOrphan(
      listingId,
      photoId,
      restoredStoragePath,
      orphanReason,
      dbOverride
    );
  }
}

export interface DigListingViewModel extends ListingCardViewModel {
  frontArtwork: DigArtworkFace;
  backArtwork: DigArtworkFace | null;
  mediaCondition: string;
  sleeveCondition: string;
  conditionSummary: string;
}

export interface DigListingsResult {
  items: DigListingViewModel[];
  totalCount: number;
  hasMore: boolean;
}

export interface DetailedListing {
  listing: Listing;
  physicalCopy: PhysicalCopy;
  release: Release;
  seller: Profile;
  photos: ListingPhotoWithUrl[];
}

/** Build a public listing-card view model from either a full join or the narrow shared search projection. */
function recordToListingCardViewModel(record: JoinedListingRecord | ListingSearchRecord): ListingCardViewModel {
  const imageUrl = record.primaryPhotoPath
    ? getPhotoPublicUrl(record.primaryPhotoPath)
    : (record.release.coverArtUrl || undefined);
  const fallbackImageUrl = record.primaryPhotoPath ? (record.release.coverArtUrl || undefined) : undefined;
  return buildListingCardViewModel({
    id: record.listing.id,
    title: record.release.title,
    artist: record.release.artist,
    releaseYear: record.release.releaseYear || undefined,
    format: record.release.format || undefined,
    priceMinorUnits: record.listing.price,
    isTrade: record.listing.tradeAvailable,
    mediaCondition: record.physicalCopy.mediaCondition,
    sleeveCondition: record.physicalCopy.sleeveCondition,
    imageUrl,
    fallbackImageUrl,
    imageAlt: record.primaryPhotoPath
      ? `Front-cover photo of the physical copy of ${record.release.title} by ${record.release.artist}`
      : record.release.coverArtUrl
        ? `Catalogue artwork for ${record.release.title} by ${record.release.artist}; release reference, not a photo of the physical copy`
        : undefined,
    sellerUsername: record.seller.username,
    sellerLocation: record.seller.location || undefined,
    url: `/listings/${record.listing.id}`,
  });
}

export async function getListingById(id: string, dbOverride?: DbInstance): Promise<Listing | null> {
  return findListingById(id, dbOverride);
}

export async function getUserListings(
  sellerId: string,
  dbOverride?: DbInstance,
  includeDismissed = false
): Promise<Listing[]> {
  return findListingsBySellerId(sellerId, dbOverride, includeDismissed);
}

const DISMISSIBLE_LISTING_STATUSES: ListingStatus[] = ['sold', 'traded', 'archived'];

/** Hide a completed listing from the owner's default dashboard without changing its lifecycle state or photos. */
export async function dismissCompletedListing(
  listingId: string,
  requestingUserId: string,
  dbOverride?: DbInstance
): Promise<Listing> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) throw new AuthorizationError('You are not authorized to dismiss this listing');
  if (!DISMISSIBLE_LISTING_STATUSES.includes(listing.status)) {
    throw new ValidationError('Only sold, traded, or archived listings can be dismissed from My Listings.');
  }
  if (listing.dismissedAt) return listing;

  const updated = await updateListingInRepo(listingId, { dismissedAt: new Date() }, dbOverride);
  if (!updated) throw new Error('Failed to dismiss listing');
  return updated;
}

/** Restore a dismissed completed listing to the owner's default dashboard. */
export async function restoreCompletedListing(
  listingId: string,
  requestingUserId: string,
  dbOverride?: DbInstance
): Promise<Listing> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) throw new AuthorizationError('You are not authorized to restore this listing');
  if (!listing.dismissedAt) throw new ValidationError('This listing is not dismissed.');
  if (!DISMISSIBLE_LISTING_STATUSES.includes(listing.status)) {
    throw new ValidationError('Only sold, traded, or archived listings can be restored from the hidden view.');
  }

  const updated = await updateListingInRepo(listingId, { dismissedAt: null }, dbOverride);
  if (!updated) throw new Error('Failed to restore listing');
  return updated;
}

export async function getPublishedListingsBySeller(
  sellerId: string,
  dbOverride?: DbInstance
): Promise<DetailedListing[]> {
  const listings = await findPublishedListingsBySellerId(sellerId, dbOverride);
  const results: DetailedListing[] = [];
  for (const l of listings) {
    const details = await getListingWithDetails(l.id, dbOverride);
    if (details) {
      results.push(details);
    }
  }
  return results;
}

export async function getRecentPublishedListings(
  limit = 10,
  dbOverride?: DbInstance
): Promise<DetailedListing[]> {
  const listings = await findRecentInRepo(limit, dbOverride);
  const results: DetailedListing[] = [];
  for (const l of listings) {
    const details = await getListingWithDetails(l.id, dbOverride);
    if (details) {
      results.push(details);
    }
  }
  return results;
}

export async function getListingWithDetails(
  listingId: string,
  dbOverride?: DbInstance
): Promise<DetailedListing | null> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    return null;
  }

  const physicalCopy = await findPhysicalCopyById(listing.physicalCopyId, dbOverride);
  if (!physicalCopy) {
    throw new NotFoundError('Associated physical copy not found');
  }

  const release = await findReleaseById(physicalCopy.releaseId, dbOverride);
  if (!release) {
    throw new NotFoundError('Associated release not found');
  }

  const seller = await findProfileById(listing.sellerId, dbOverride);
  if (!seller) {
    throw new NotFoundError('Seller profile not found');
  }

  const photoRecords = await findPhotosByListingId(listingId, dbOverride);
  const photos: ListingPhotoWithUrl[] = photoRecords.map(listingPhotoWithPublicUrl);

  return {
    listing,
    physicalCopy,
    release,
    seller,
    photos,
  };
}

export async function getListingWithDetailsForView(
  listingId: string,
  requestingUserId?: string,
  dbOverride?: DbInstance
): Promise<DetailedListing> {
  const detailed = await getListingWithDetails(listingId, dbOverride);
  if (!detailed) {
    throw new NotFoundError('Listing not found');
  }

  // Public visibility boundary:
  // Non-published listings can only be viewed by the seller.
  if (detailed.listing.status !== 'published' && detailed.listing.sellerId !== requestingUserId) {
    throw new NotFoundError('Listing not found');
  }

  return detailed;
}

export async function getHomeFeedListings(
  limit = 6,
  dbOverride?: DbInstance
): Promise<ListingCardViewModel[]> {
  const result = await searchListings(
    { status: 'published', sort: 'newest', page: 1, limit },
    dbOverride
  );
  return result.records.map(recordToListingCardViewModel);
}

/** Rotate through published listings outside Recent Drops using a fresh indexed UUID cursor per visit. */
export async function getHomeDiscoveryListings(
  limit = 6,
  excludedListingIds: string[] = [],
  dbOverride?: DbInstance
): Promise<ListingCardViewModel[]> {
  const records = await findHomeDiscoveryInRepo(
    crypto.randomUUID(),
    limit,
    excludedListingIds,
    dbOverride
  );
  return records.map(recordToListingCardViewModel);
}

export async function hasExplicitWhiteLabelInventory(dbOverride?: DbInstance): Promise<boolean> {
  return hasWhiteLabelInRepo(dbOverride);
}

/** Load a bounded Dig result set and attach its public front/back photo metadata in one batch. */
export async function searchDigListings(
  params: SearchListingsParams,
  dbOverride?: DbInstance
): Promise<DigListingsResult> {
  const result = await searchListings(
    { ...params, page: 1, limit: 100 },
    dbOverride,
    { attachPrimaryPhotoPaths: false }
  );
  const listingIds = result.records.map((record) => record.listing.id);
  const photoRecords = await findDigPhotosByListingIds(listingIds, dbOverride);
  const photosByListingId = new Map<string, Array<DigPhotoCandidate & { storagePath: string }>>();

  for (const photo of photoRecords) {
    const current = photosByListingId.get(photo.listingId) || [];
    current.push({
      role: photo.role,
      displayOrder: photo.displayOrder,
      publicUrl: getPhotoPublicUrl(photo.storagePath),
      altText: photo.altText,
      storagePath: photo.storagePath,
    });
    photosByListingId.set(photo.listingId, current);
  }

  const items: DigListingViewModel[] = result.records.map((record) => {
    const photoCandidates = photosByListingId.get(record.listing.id) || [];
    const artworkPhotos: DigPhotoCandidate[] = photoCandidates.map(({ role, displayOrder, publicUrl, altText }) => ({
      role,
      displayOrder,
      publicUrl,
      altText,
    }));
    const primaryPhotoPath = photoCandidates.find((photo) => photo.role === 'front_cover')?.storagePath || null;
    const artwork = resolveDigArtwork(artworkPhotos, record.release.title, record.release.artist, undefined, record.release.coverArtUrl);
    const base = recordToListingCardViewModel({ ...record, primaryPhotoPath });

    return {
      ...base,
      priceFormatted: formatPrice(
        record.listing.price,
        record.listing.tradeAvailable && record.listing.price === null
      ),
      url: `/listings/${record.listing.id}`,
      frontArtwork: artwork.front,
      backArtwork: artwork.back,
      mediaCondition: record.physicalCopy.mediaCondition,
      sleeveCondition: record.physicalCopy.sleeveCondition,
      conditionSummary: `Media ${record.physicalCopy.mediaCondition} · hoes ${record.physicalCopy.sleeveCondition}`,
    };
  });

  return { items, totalCount: result.totalCount, hasMore: result.totalCount > items.length };
}

export async function searchBrowseListings(
  params: SearchListingsParams,
  dbOverride?: DbInstance
): Promise<{
  items: ListingCardViewModel[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const result = await searchListings(params, dbOverride);
  return {
    items: result.records.map(recordToListingCardViewModel),
    totalCount: result.totalCount,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

export async function getSellerPublishedListings(
  sellerUsername: string,
  options: { page?: number } = {},
  dbOverride?: DbInstance
): Promise<{
  items: ListingCardViewModel[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = options.page !== undefined ? Math.max(1, options.page) : 1;
  const limit = 12; // Enforce strict 12 listings per page grid contract

  const result = await searchListings(
    { status: 'published', sellerUsername, sort: 'newest', page, limit },
    dbOverride
  );
  return {
    items: result.records.map(recordToListingCardViewModel),
    totalCount: result.totalCount,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

export async function createListing(
  requestingUserId: string,
  input: CreateListingInput,
  dbOverride?: DbInstance
): Promise<Listing> {
  if (input.sellerId !== requestingUserId) {
    throw new AuthorizationError('Cannot create listing on behalf of another user');
  }

  const parseResult = createListingSchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid listing input: ${issueMsg}`);
  }

  const data = parseResult.data;

  const physicalCopy = await findPhysicalCopyById(data.physicalCopyId, dbOverride);
  if (!physicalCopy) {
    throw new NotFoundError('Referenced PhysicalCopy does not exist');
  }

  if (physicalCopy.ownerId !== data.sellerId) {
    throw new AuthorizationError('PhysicalCopy does not belong to the seller');
  }

  return createListingInRepo(
    {
      physicalCopyId: data.physicalCopyId,
      sellerId: data.sellerId,
      price: data.price ?? null,
      currency: data.currency || 'EUR',
      tradeAvailable: data.tradeAvailable ?? false,
      description: data.description || null,
      status: 'draft',
    },
    dbOverride
  );
}

export async function createListingFromRelease(
  requestingUserId: string,
  input: CreateListingFromReleaseInput,
  dbOverride?: DbInstance
): Promise<Listing> {
  const parseResult = createListingFromReleaseSchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid listing input: ${issueMsg}`);
  }

  const data = parseResult.data;

  const release = await findReleaseById(data.releaseId, dbOverride);
  if (!release) {
    throw new NotFoundError('Selected release not found');
  }

  let priceInCents: number | null = null;
  try {
    priceInCents = parsePriceEurToCents(data.priceEur);
  } catch (err) {
    throw new ValidationError((err as Error).message);
  }

  const db = dbOverride || getDb();

  // Execute PhysicalCopy and Listing creation inside a true database transaction
  return db.transaction(async (tx) => {
    const physicalCopy = await createPhysicalCopy(
      {
        releaseId: data.releaseId,
        ownerId: requestingUserId,
        mediaCondition: data.mediaCondition,
        sleeveCondition: data.sleeveCondition,
        notes: data.notes || null,
      },
      tx as unknown as DbInstance
    );

    const listing = await createListingInRepo(
      {
        physicalCopyId: physicalCopy.id,
        sellerId: requestingUserId,
        price: priceInCents,
        currency: 'EUR',
        tradeAvailable: data.tradeAvailable,
        description: data.description || null,
        status: 'draft',
      },
      tx as unknown as DbInstance
    );

    return listing;
  });
}

export async function updateListing(
  listingId: string,
  requestingUserId: string,
  input: UpdateListingDetailsInput,
  dbOverride?: DbInstance
): Promise<Listing> {
  const existingListing = await findListingById(listingId, dbOverride);
  if (!existingListing) {
    throw new NotFoundError('Listing not found');
  }

  if (existingListing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this listing');
  }

  const parseResult = updateListingDetailsSchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid listing update input: ${issueMsg}`);
  }

  const data = parseResult.data;

  const targetStatus = data.status || existingListing.status;
  const targetPrice = data.price !== undefined ? data.price : existingListing.price;
  const targetTradeAvailable =
    data.tradeAvailable !== undefined ? data.tradeAvailable : existingListing.tradeAvailable;

  validateListingTransition({
    currentStatus: existingListing.status,
    targetStatus,
    price: targetPrice,
    tradeAvailable: targetTradeAvailable,
  });

  // If physical copy attributes are updated, update physical copy record via Zod validated values
  if (data.mediaCondition || data.sleeveCondition || data.notes !== undefined) {
    const physicalCopy = await findPhysicalCopyById(existingListing.physicalCopyId, dbOverride);
    if (physicalCopy) {
      await updatePhysicalCopy(
        physicalCopy.id,
        {
          ...(data.mediaCondition && { mediaCondition: data.mediaCondition }),
          ...(data.sleeveCondition && { sleeveCondition: data.sleeveCondition }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        dbOverride
      );
    }
  }

  const updated = await updateListingInRepo(
    listingId,
    {
      ...(data.price !== undefined && { price: data.price ?? null }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.tradeAvailable !== undefined && { tradeAvailable: data.tradeAvailable }),
      ...(data.description !== undefined && { description: data.description || null }),
      ...(data.status !== undefined && { status: data.status }),
    },
    dbOverride
  );

  if (!updated) {
    throw new Error('Failed to update listing');
  }

  return updated;
}

export async function addPhotoToListing(
  listingId: string,
  requestingUserId: string,
  file: { buffer: Buffer; mimetype: string; originalname?: string },
  altText?: string,
  dbOverride?: DbInstance,
  storageOptions?: StorageOptions,
  roleInput?: unknown,
  sourceFile?: { buffer: Buffer; mimetype: string; originalname?: string },
  editorStateInput?: unknown
): Promise<ListingPhotoWithUrl> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to upload photos to this listing');
  }
  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot add photos to a listing in terminal state '${listing.status}'`);
  }

  const existingPhotoCount = await countPhotosByListingId(listingId, dbOverride);
  if (existingPhotoCount >= MAX_PHOTOS_PER_LISTING) {
    throw new ValidationError(`Maximum photo limit (${MAX_PHOTOS_PER_LISTING} photos per listing) reached`);
  }

  const roleResult = newListingPhotoRoleSchema.safeParse(roleInput);
  if (!roleResult.success) throw new ValidationError('Choose a photo role before uploading.');
  const role = roleResult.data;

  const submittedAltText = typeof altText === 'string' ? altText.trim() : '';
  const defaultAltText = role === 'front_cover'
    ? 'Front cover of the record sleeve'
    : role === 'back_cover'
      ? 'Back cover of the record sleeve'
      : undefined;
  const altTextResult = listingPhotoAltTextSchema.safeParse(submittedAltText || defaultAltText);
  if (!altTextResult.success) {
    throw new ValidationError(altTextResult.error.issues.map((issue) => issue.message).join('; '));
  }

  if (sourceFile && (
    !sourceFile.buffer.length ||
    sourceFile.buffer.length > 5 * 1024 * 1024
  )) {
    throw new ValidationError('The original photo must be a valid image no larger than 5 MiB.');
  }

  let processed: ProcessedImage;
  let sourceMaster: ProcessedImage;
  try {
    processed = await processAndValidateImage(file.buffer, file.mimetype);
    const original = sourceFile || file;
    sourceMaster = await preserveListingPhotoSource(original.buffer, original.mimetype);
  } catch (err) {
    throw new ValidationError((err as Error).message);
  }

  if ((role === 'front_cover' || role === 'back_cover') && processed.width !== processed.height) {
    const side = role === 'front_cover' ? 'front-cover' : 'back-cover';
    throw new ValidationError('Crop the ' + side + ' photo to a square in the preview before uploading.');
  }

  const editorState = parseEditorState(editorStateInput);
  if (editorState && (
    editorState.sourceWidth !== sourceMaster.width ||
    editorState.sourceHeight !== sourceMaster.height
  )) {
    throw new ValidationError('The saved edit recipe does not match the selected original photo. Reopen the editor and try again.');
  }

  const photoId = crypto.randomUUID();
  const sourceIsLegacy = !sourceFile;
  const expectedSourcePath = listingPhotoSourceStoragePath(listingId, photoId);
  let sourceStoragePath: string;
  try {
    sourceStoragePath = await uploadListingPhotoSourceToStorage(
      listingId,
      photoId,
      sourceMaster.buffer,
      storageOptions
    );
  } catch (sourceUploadError) {
    try {
      await deleteListingPhotoSourceFromStorage(expectedSourcePath, storageOptions);
    } catch {
      await recordPhotoStorageOrphan(
        listingId,
        photoId,
        expectedSourcePath,
        'PHOTO_SOURCE_UPLOAD_FAILED_SOURCE_CLEANUP_FAILED',
        dbOverride
      );
    }
    throw sourceUploadError;
  }

  const expectedDisplayPath = listingPhotoStoragePath(listingId, photoId, processed.extension);
  let storagePath: string;
  try {
    storagePath = await uploadListingPhotoToStorage({
      listingId,
      photoId,
      buffer: processed.buffer,
      contentType: processed.contentType,
      extension: processed.extension,
      options: storageOptions,
    });
  } catch (uploadError) {
    try {
      await deleteListingPhotoFromStorage(expectedDisplayPath, storageOptions);
    } catch {
      await recordPhotoStorageOrphan(
        listingId,
        photoId,
        expectedDisplayPath,
        'PHOTO_DISPLAY_UPLOAD_FAILED_DISPLAY_CLEANUP_FAILED',
        dbOverride
      );
    }
    try {
      await deleteListingPhotoSourceFromStorage(sourceStoragePath, storageOptions);
    } catch {
      await recordPhotoStorageOrphan(
        listingId,
        photoId,
        sourceStoragePath,
        'PHOTO_DISPLAY_UPLOAD_FAILED_SOURCE_CLEANUP_FAILED',
        dbOverride
      );
    }
    throw uploadError;
  }

  try {
    const photoRecord = await createListingPhoto({
      id: photoId,
      listingId,
      storagePath,
      sourceStoragePath,
      sourceIsLegacy,
      editorState,
      displayOrder: existingPhotoCount,
      altText: altTextResult.data,
      role,
    }, dbOverride);

    return listingPhotoWithPublicUrl(photoRecord);
  } catch (dbErr) {
    try {
      await deleteListingPhotoFromStorage(storagePath, storageOptions);
    } catch {
      await recordPhotoStorageOrphan(
        listingId,
        photoId,
        storagePath,
        'UPLOAD_DB_INSERT_FAILED_DISPLAY_CLEANUP_FAILED',
        dbOverride
      );
    }
    try {
      await deleteListingPhotoSourceFromStorage(sourceStoragePath, storageOptions);
    } catch {
      await recordPhotoStorageOrphan(
        listingId,
        photoId,
        sourceStoragePath,
        'UPLOAD_DB_INSERT_FAILED_SOURCE_CLEANUP_FAILED',
        dbOverride
      );
    }
    if ((dbErr as { code?: string }).code === '23505') {
      throw new ValidationError('This listing already has a photo assigned to that sleeve side. Reclassify the existing photo before adding another one.');
    }
    throw dbErr;
  }
}

export interface ListingPhotoEditorSource {
  buffer: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  sourceIsLegacy: boolean;
  editorState: ListingPhotoEditorState | null;
}

/**
 * Returns a seller-owned private source. Photos uploaded before source retention
 * existed get a private, lossless baseline made from their current display file;
 * this is explicitly not represented as the unrecoverable original camera photo.
 */
export async function getListingPhotoEditorSource(
  listingId: string,
  photoId: string,
  requestingUserId: string,
  dbOverride?: DbInstance,
  storageOptions?: StorageOptions
): Promise<ListingPhotoEditorSource> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to edit photos for this listing');
  }
  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot edit photos for a listing in terminal state '${listing.status}'`);
  }

  const photo = await findPhotoById(photoId, dbOverride);
  if (!photo || photo.listingId !== listingId) throw new NotFoundError('Photo not found');

  let sourceStoragePath = photo.sourceStoragePath;
  let sourceIsLegacy = photo.sourceIsLegacy;
  if (!sourceStoragePath) {
    const displayBuffer = await downloadListingPhotoFromStorage(photo.storagePath, storageOptions);
    let sourceMaster: ProcessedImage;
    try {
      sourceMaster = await preserveListingPhotoSource(displayBuffer, 'image/webp');
    } catch (error) {
      throw new ValidationError((error as Error).message);
    }

    const expectedPath = listingPhotoSourceStoragePath(listingId, photoId);
    let uploadedNewSource = false;
    try {
      sourceStoragePath = await uploadListingPhotoSourceToStorage(
        listingId,
        photoId,
        sourceMaster.buffer,
        storageOptions
      );
      uploadedNewSource = true;
    } catch (uploadError) {
      // Another editor tab may have initialized the same deterministic legacy path.
      try {
        await downloadListingPhotoSourceFromStorage(expectedPath, storageOptions);
        sourceStoragePath = expectedPath;
      } catch {
        throw uploadError;
      }
    }

    let updated: ListingPhoto | null;
    try {
      updated = await updateListingPhotoSource(
        listingId,
        photoId,
        sourceStoragePath,
        true,
        dbOverride
      );
    } catch (updateError) {
      if (uploadedNewSource) {
        try {
          await deleteListingPhotoSourceFromStorage(sourceStoragePath, storageOptions);
        } catch {
          await recordPhotoStorageOrphan(
            listingId,
            photoId,
            sourceStoragePath,
            'LEGACY_SOURCE_INITIALIZATION_UPDATE_FAILED_CLEANUP_FAILED',
            dbOverride
          );
        }
      }
      throw updateError;
    }
    if (!updated) {
      if (uploadedNewSource) {
        try {
          await deleteListingPhotoSourceFromStorage(sourceStoragePath, storageOptions);
        } catch {
          await recordPhotoStorageOrphan(
            listingId,
            photoId,
            sourceStoragePath,
            'LEGACY_SOURCE_INITIALIZATION_ROW_MISSING',
            dbOverride
          );
        }
      }
      throw new NotFoundError('Photo not found');
    }
    sourceIsLegacy = true;
  }

  if (!sourceStoragePath) throw new Error('The private photo source was not initialized.');
  const buffer = await downloadListingPhotoSourceFromStorage(sourceStoragePath, storageOptions);
  const dimensions = await readImageDimensions(buffer);
  return {
    buffer,
    sourceWidth: dimensions.width,
    sourceHeight: dimensions.height,
    sourceIsLegacy,
    editorState: photo.editorState || null,
  };
}

/**
 * Save a new public derivative while preserving the immutable private source.
 * A unique object path is uploaded first; only then is the DB pointer changed.
 */
export async function saveListingPhotoEditor(
  listingId: string,
  photoId: string,
  requestingUserId: string,
  file: { buffer: Buffer; mimetype: string; originalname?: string },
  editorStateInput: unknown,
  altTextInput: unknown,
  dbOverride?: DbInstance,
  storageOptions?: StorageOptions
): Promise<ListingPhotoWithUrl> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to edit photos for this listing');
  }
  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot edit photos for a listing in terminal state '${listing.status}'`);
  }

  const photo = await findPhotoById(photoId, dbOverride);
  if (!photo || photo.listingId !== listingId) throw new NotFoundError('Photo not found');

  const submittedAltText = typeof altTextInput === 'string' ? altTextInput.trim() : '';
  let altText = photo.altText;
  if (submittedAltText) {
    const altTextResult = listingPhotoAltTextSchema.safeParse(submittedAltText);
    if (!altTextResult.success) {
      throw new ValidationError(altTextResult.error.issues.map((issue) => issue.message).join('; '));
    }
    altText = altTextResult.data;
  }

  const editorState = parseEditorState(editorStateInput);
  if (!editorState) {
    throw new ValidationError('Save the crop and adjustments in the photo editor before applying them.');
  }

  const source = await getListingPhotoEditorSource(
    listingId,
    photoId,
    requestingUserId,
    dbOverride,
    storageOptions
  );
  if (
    editorState.sourceWidth !== source.sourceWidth ||
    editorState.sourceHeight !== source.sourceHeight
  ) {
    throw new ValidationError('The edit recipe does not match the saved original. Reopen the photo editor and try again.');
  }

  let processed: ProcessedImage;
  try {
    processed = await processAndValidateImage(file.buffer, file.mimetype);
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
  if ((photo.role === 'front_cover' || photo.role === 'back_cover') &&
      processed.width !== processed.height) {
    throw new ValidationError('Cover photos must remain square. Reopen the editor and correct the sleeve crop.');
  }

  const version = crypto.randomUUID();
  const nextStoragePath = await uploadListingPhotoToStorage({
    listingId,
    photoId,
    buffer: processed.buffer,
    contentType: processed.contentType,
    extension: processed.extension,
    version,
    options: storageOptions,
  });

  let updated: ListingPhoto | null;
  try {
    updated = await updateListingPhotoEditor(
      listingId,
      photoId,
      photo.storagePath,
      nextStoragePath,
      editorState,
      altText,
      dbOverride
    );
  } catch (error) {
    try {
      await deleteListingPhotoFromStorage(nextStoragePath, storageOptions);
    } catch {
      await recordPhotoStorageOrphan(
        listingId,
        photoId,
        nextStoragePath,
        'PHOTO_EDIT_DB_UPDATE_FAILED_NEW_DERIVATIVE_CLEANUP_FAILED',
        dbOverride
      );
    }
    throw error;
  }

  if (!updated) {
    try {
      await deleteListingPhotoFromStorage(nextStoragePath, storageOptions);
    } catch {
      await recordPhotoStorageOrphan(
        listingId,
        photoId,
        nextStoragePath,
        'PHOTO_EDIT_ROW_MISSING_NEW_DERIVATIVE_CLEANUP_FAILED',
        dbOverride
      );
    }
    throw new ValidationError('This photo was changed in another tab. Reopen the editor before saving again.');
  }

  try {
    await deleteListingPhotoFromStorage(photo.storagePath, storageOptions);
  } catch {
    await recordPhotoStorageOrphan(
      listingId,
      photoId,
      photo.storagePath,
      'PHOTO_EDIT_OLD_DERIVATIVE_CLEANUP_FAILED',
      dbOverride
    );
  }

  return listingPhotoWithPublicUrl(updated);
}

export async function updateListingPhotoRole(
  listingId: string,
  photoId: string,
  requestingUserId: string,
  roleInput: unknown,
  dbOverride?: DbInstance,
  storageOptions?: StorageOptions
): Promise<ListingPhotoWithUrl> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to modify photos for this listing');
  }
  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot classify photos on a listing in terminal state '${listing.status}'`);
  }

  const roleResult = listingPhotoRoleSchema.safeParse(roleInput);
  if (!roleResult.success) throw new ValidationError('Choose a valid photo role.');
  const photo = await findPhotoById(photoId, dbOverride);
  if (!photo || photo.listingId !== listingId) throw new NotFoundError('Photo not found');
  const role: ListingPhotoRole = roleResult.data;

  if (role === 'front_cover' || role === 'back_cover') {
    const photos = await findPhotosByListingId(listingId, dbOverride);
    const conflictingPhoto = photos.find((candidate) => candidate.id !== photoId && candidate.role === role);
    if (conflictingPhoto) {
      const side = role === 'front_cover' ? 'front cover' : 'back cover';
      throw new ValidationError(`This listing already has a ${side}. Change that photo's role first.`);
    }

    // Existing photos can be reclassified from this form, so check their stored pixels too.
    // Otherwise a portrait image could bypass the crop requirement via "Save role".
    try {
      const storedBuffer = await downloadListingPhotoFromStorage(photo.storagePath, storageOptions);
      const storedImage = await processAndValidateImage(storedBuffer);
      if (storedImage.width !== storedImage.height) {
        throw new ValidationError(
          'Crop this ' + (role === 'front_cover' ? 'front-cover' : 'back-cover') +
          ' photo to a square before assigning it this role. Delete it and upload it again using the square crop preview.'
        );
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      console.error(JSON.stringify({
        event: 'cover_role_image_check_failed',
        listingId,
        photoId,
      }));
      throw new ValidationError(
        'This saved photo could not be checked. Upload it again through the square crop preview before assigning a cover role.'
      );
    }
  }

  const updated = await updatePhotoRoleInRepo(listingId, photoId, role, dbOverride).catch((error: unknown) => {
    // The preflight conflict check above improves the normal user message, but two
    // concurrent requests can still race. Preserve the partial unique indexes as
    // the final authority and translate their violation into the same validation error.
    const dbError = error as { code?: string };
    if (dbError.code === '23505' && (role === 'front_cover' || role === 'back_cover')) {
      const side = role === 'front_cover' ? 'front cover' : 'back cover';
      throw new ValidationError(`This listing already has a ${side}. Change that photo's role first.`);
    }
    throw error;
  });
  if (!updated) throw new NotFoundError('Photo not found');
  return { ...updated, publicUrl: getPhotoPublicUrl(updated.storagePath) };
}

export async function deletePhotoFromListing(
  listingId: string,
  photoId: string,
  requestingUserId: string,
  dbOverride?: DbInstance,
  storageOptions?: StorageOptions
): Promise<boolean> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to modify photos for this listing');
  }
  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot delete photos from a listing in terminal state '${listing.status}'`);
  }

  const photo = await findPhotoById(photoId, dbOverride);
  if (!photo || photo.listingId !== listingId) throw new NotFoundError('Photo not found');

  // Snapshot every object before deleting anything. Storage timeouts can happen
  // after a provider has completed a delete, so attempted removals are compensated.
  const displayBuffer = await downloadListingPhotoFromStorage(photo.storagePath, storageOptions);
  const sourceBuffer = photo.sourceStoragePath
    ? await downloadListingPhotoSourceFromStorage(photo.sourceStoragePath, storageOptions)
    : null;
  let attemptedDisplayDelete = false;
  let attemptedSourceDelete = false;

  const restoreObjects = async (): Promise<void> => {
    if (attemptedDisplayDelete) {
      try {
        await restoreListingPhotoSnapshot(
          listingId,
          photoId,
          photo.storagePath,
          displayBuffer,
          dbOverride,
          storageOptions,
          'PHOTO_DELETE_DISPLAY_RESTORE_REPOINT_FAILED'
        );
      } catch {
        await recordPhotoStorageOrphan(
          listingId,
          photoId,
          photo.storagePath,
          'PHOTO_DELETE_DISPLAY_RESTORE_FAILED',
          dbOverride
        );
      }
    }
    if (attemptedSourceDelete && photo.sourceStoragePath && sourceBuffer) {
      try {
        await restoreListingPhotoSourceToStorage(photo.sourceStoragePath, sourceBuffer, storageOptions);
      } catch {
        await recordPhotoStorageOrphan(
          listingId,
          photoId,
          photo.sourceStoragePath,
          'PHOTO_DELETE_SOURCE_RESTORE_FAILED',
          dbOverride
        );
      }
    }
  };

  try {
    attemptedDisplayDelete = true;
    await deleteListingPhotoFromStorage(photo.storagePath, storageOptions);
    if (photo.sourceStoragePath) {
      attemptedSourceDelete = true;
      await deleteListingPhotoSourceFromStorage(photo.sourceStoragePath, storageOptions);
    }
  } catch (storageError) {
    await restoreObjects();
    throw storageError;
  }

  try {
    const deleted = await deleteListingPhoto(photoId, dbOverride);
    if (!deleted) throw new Error('Photo metadata could not be removed.');
  } catch (databaseError) {
    await restoreObjects();
    throw databaseError;
  }

  const remainingPhotos = await findPhotosByListingId(listingId, dbOverride);
  await updatePhotoOrder(
    listingId,
    remainingPhotos.map((remainingPhoto) => remainingPhoto.id),
    dbOverride
  );
  return true;
}

/**
 * Permanently delete an owner's archived listing. Download and remove its
 * photos first; on any failure restore removed objects and keep the listing.
 * The canonical Release is shared catalogue data and is never deleted.
 */
export async function permanentlyDeleteArchivedListing(
  listingId: string,
  requestingUserId: string,
  dbOverride?: DbInstance,
  storageOptions?: StorageOptions
): Promise<boolean> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) return false;
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to delete this listing');
  }
  if (listing.status !== 'archived') {
    throw new ValidationError('Archive this listing before permanently deleting it.');
  }

  const photos = await findPhotosByListingId(listingId, dbOverride);
  const snapshots = await Promise.all(photos.map(async (photo) => ({
    photo,
    displayBuffer: await downloadListingPhotoFromStorage(photo.storagePath, storageOptions),
    sourceBuffer: photo.sourceStoragePath
      ? await downloadListingPhotoSourceFromStorage(photo.sourceStoragePath, storageOptions)
      : null,
  })));

  const attemptedRemovals: typeof snapshots = [];
  const restoreRemovedPhotos = async (): Promise<void> => {
    for (const snapshot of attemptedRemovals) {
      try {
        await restoreListingPhotoSnapshot(
          listingId,
          snapshot.photo.id,
          snapshot.photo.storagePath,
          snapshot.displayBuffer,
          dbOverride,
          storageOptions,
          'ARCHIVED_LISTING_DELETE_DISPLAY_RESTORE_REPOINT_FAILED'
        );
      } catch {
        await recordPhotoStorageOrphan(
          listingId,
          snapshot.photo.id,
          snapshot.photo.storagePath,
          'ARCHIVED_LISTING_DELETE_DISPLAY_RESTORE_FAILED',
          dbOverride
        );
      }

      if (snapshot.photo.sourceStoragePath && snapshot.sourceBuffer) {
        try {
          await restoreListingPhotoSourceToStorage(
            snapshot.photo.sourceStoragePath,
            snapshot.sourceBuffer,
            storageOptions
          );
        } catch {
          await recordPhotoStorageOrphan(
            listingId,
            snapshot.photo.id,
            snapshot.photo.sourceStoragePath,
            'ARCHIVED_LISTING_DELETE_SOURCE_RESTORE_FAILED',
            dbOverride
          );
        }
      }
    }
  };

  try {
    for (const snapshot of snapshots) {
      // Mark before requesting the remote delete: a timeout may arrive after
      // Storage removed the object, and compensation must still restore it.
      attemptedRemovals.push(snapshot);
      await deleteListingPhotoFromStorage(snapshot.photo.storagePath, storageOptions);
      if (snapshot.photo.sourceStoragePath) {
        await deleteListingPhotoSourceFromStorage(snapshot.photo.sourceStoragePath, storageOptions);
      }
    }
  } catch (storageError) {
    await restoreRemovedPhotos();
    throw storageError;
  }

  try {
    const db = dbOverride || getDb();
    const deleted = await db.transaction(async (tx) => {
      const removedListing = await deleteArchivedListingByOwner(listingId, requestingUserId, tx as unknown as DbInstance);
      if (!removedListing) return null;
      const remainingListings = await countListingsByPhysicalCopyId(removedListing.physicalCopyId, tx as unknown as DbInstance);
      if (remainingListings === 0) {
        await deletePhysicalCopy(removedListing.physicalCopyId, tx as unknown as DbInstance);
      }
      return removedListing;
    });

    if (!deleted) {
      const stillExists = await findListingById(listingId, dbOverride);
      if (stillExists) await restoreRemovedPhotos();
      return false;
    }
    return true;
  } catch (databaseError) {
    await restoreRemovedPhotos();
    throw databaseError;
  }
}

export async function reorderListingPhotos(
  listingId: string,
  requestingUserId: string,
  orderedPhotoIds: string[],
  dbOverride?: DbInstance
): Promise<ListingPhotoWithUrl[]> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to reorder photos for this listing');
  }

  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot reorder photos on a listing in terminal state '${listing.status}'`);
  }

  // Parse and validate input photo array using Zod schema
  const parseResult = reorderPhotosSchema.safeParse({ photoIds: orderedPhotoIds });
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid photo reorder payload: ${issueMsg}`);
  }

  const currentPhotos = await findPhotosByListingId(listingId, dbOverride);
  const currentPhotoIds = new Set(currentPhotos.map((p) => p.id));

  // Validate submitted IDs form an exact permutation of current photos
  if (orderedPhotoIds.length !== currentPhotos.length) {
    throw new ValidationError(
      `Reordering requires exact count of current photos (${currentPhotos.length}), got ${orderedPhotoIds.length}`
    );
  }

  const uniqueSubmittedIds = new Set(orderedPhotoIds);
  if (uniqueSubmittedIds.size !== orderedPhotoIds.length) {
    throw new ValidationError('Reorder request contains duplicate photo IDs');
  }

  for (const id of orderedPhotoIds) {
    if (!currentPhotoIds.has(id)) {
      throw new ValidationError(`Photo ID '${id}' does not belong to this listing`);
    }
  }

  await updatePhotoOrder(listingId, orderedPhotoIds, dbOverride);

  const updatedPhotos = await findPhotosByListingId(listingId, dbOverride);
  return updatedPhotos.map((p) => ({
    ...p,
    publicUrl: getPhotoPublicUrl(p.storagePath),
  }));
}

export async function publishListing(
  listingId: string,
  requestingUserId: string,
  options: { previewConfirmed?: boolean } = {},
  dbOverride?: DbInstance
): Promise<Listing> {
  const { previewConfirmed = false } = options;

  if (!previewConfirmed) {
    throw new ValidationError(
      'Preview confirmation required before publishing listing. Please view the preview first.'
    );
  }

  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to publish this listing');
  }

  validateListingTransition({
    currentStatus: listing.status,
    targetStatus: 'published',
    price: listing.price,
    tradeAvailable: listing.tradeAvailable,
  });

  const updated = await updateStatusInRepo(listingId, 'published', dbOverride);
  if (!updated) {
    throw new Error('Failed to publish listing');
  }

  await recordListingPublishedEvent(requestingUserId, listingId, dbOverride);

  return updated;
}

export async function archiveListing(
  listingId: string,
  requestingUserId: string,
  dbOverride?: DbInstance
): Promise<Listing> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to archive this listing');
  }

  validateListingTransition({
    currentStatus: listing.status,
    targetStatus: 'archived',
    price: listing.price,
    tradeAvailable: listing.tradeAvailable,
  });

  const updated = await updateStatusInRepo(listingId, 'archived', dbOverride);
  if (!updated) {
    throw new Error('Failed to archive listing');
  }

  return updated;
}

export async function transitionListingStatus(
  listingId: string,
  requestingUserId: string,
  targetStatus: ListingStatus,
  dbOverride?: DbInstance
): Promise<Listing> {
  const existingListing = await findListingById(listingId, dbOverride);
  if (!existingListing) {
    throw new NotFoundError('Listing not found');
  }

  if (existingListing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to transition this listing status');
  }

  validateListingTransition({
    currentStatus: existingListing.status,
    targetStatus,
    price: existingListing.price,
    tradeAvailable: existingListing.tradeAvailable,
  });

  const updated = await updateStatusInRepo(listingId, targetStatus, dbOverride);
  if (!updated) {
    throw new Error('Failed to transition listing status');
  }

  return updated;
}
