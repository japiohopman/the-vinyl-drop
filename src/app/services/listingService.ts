import crypto from 'crypto';
import { getDb } from '../../db';
import { ConditionGrade, ListingStatus } from '../../db/schema/enums';
import { ListingPhoto } from '../../db/schema/listingPhotos';
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
  UpdateListingInput,
  updateListingSchema,
} from '../../validators/listing';
import {
  countPhotosByListingId,
  createListingPhoto,
  deleteListingPhoto,
  findPhotoById,
  findPhotosByListingId,
  updatePhotoOrder,
} from '../repositories/listingPhotoRepository';
import {
  createListing as createListingInRepo,
  findListingById,
  findListingsBySellerId,
  updateListing as updateListingInRepo,
  updateListingStatus as updateStatusInRepo,
} from '../repositories/listingRepository';
import {
  createPhysicalCopy,
  findPhysicalCopyById,
  updatePhysicalCopy,
} from '../repositories/physicalCopyRepository';
import { findProfileById } from '../repositories/profileRepository';
import { findReleaseById } from '../repositories/releaseRepository';
import { ProcessedImage, processAndValidateImage } from '../utils/imageProcessor';
import {
  deleteListingPhotoFromStorage,
  getPhotoPublicUrl,
  uploadListingPhotoToStorage,
} from './storageService';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';

type DbInstance = ReturnType<typeof getDb>;

export interface ListingPhotoWithUrl extends ListingPhoto {
  publicUrl: string;
}

export interface DetailedListing {
  listing: Listing;
  physicalCopy: PhysicalCopy;
  release: Release;
  seller: Profile;
  photos: ListingPhotoWithUrl[];
}

export async function getListingById(id: string, dbOverride?: DbInstance): Promise<Listing | null> {
  return findListingById(id, dbOverride);
}

export async function getUserListings(sellerId: string, dbOverride?: DbInstance): Promise<Listing[]> {
  return findListingsBySellerId(sellerId, dbOverride);
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
  const photos: ListingPhotoWithUrl[] = photoRecords.map((photo) => ({
    ...photo,
    publicUrl: getPhotoPublicUrl(photo.storagePath),
  }));

  return {
    listing,
    physicalCopy,
    release,
    seller,
    photos,
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

  // Create PhysicalCopy record
  const physicalCopy = await createPhysicalCopy(
    {
      releaseId: data.releaseId,
      ownerId: requestingUserId,
      mediaCondition: data.mediaCondition,
      sleeveCondition: data.sleeveCondition,
      notes: data.notes || null,
    },
    dbOverride
  );

  // Create Listing in draft status
  return createListingInRepo(
    {
      physicalCopyId: physicalCopy.id,
      sellerId: requestingUserId,
      price: priceInCents,
      currency: 'EUR',
      tradeAvailable: data.tradeAvailable,
      description: data.description || null,
      status: 'draft',
    },
    dbOverride
  );
}

export async function updateListing(
  listingId: string,
  requestingUserId: string,
  input: UpdateListingInput & { mediaCondition?: string; sleeveCondition?: string; notes?: string },
  dbOverride?: DbInstance
): Promise<Listing> {
  const existingListing = await findListingById(listingId, dbOverride);
  if (!existingListing) {
    throw new NotFoundError('Listing not found');
  }

  if (existingListing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this listing');
  }

  const parseResult = updateListingSchema.safeParse(input);
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

  // If physical copy attributes are updated, update physical copy record
  if (input.mediaCondition || input.sleeveCondition || input.notes !== undefined) {
    const physicalCopy = await findPhysicalCopyById(existingListing.physicalCopyId, dbOverride);
    if (physicalCopy) {
      await updatePhysicalCopy(
        physicalCopy.id,
        {
          ...(input.mediaCondition && { mediaCondition: input.mediaCondition as ConditionGrade }),
          ...(input.sleeveCondition && { sleeveCondition: input.sleeveCondition as ConditionGrade }),
          ...(input.notes !== undefined && { notes: input.notes }),
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
  dbOverride?: DbInstance
): Promise<ListingPhotoWithUrl> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to upload photos to this listing');
  }

  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot add photos to a listing in terminal state '${listing.status}'`);
  }

  const existingPhotoCount = await countPhotosByListingId(listingId, dbOverride);
  if (existingPhotoCount >= 5) {
    throw new ValidationError('Maximum photo limit (5 photos per listing) reached');
  }

  // Safe Sharp inspection and processing
  let processed: ProcessedImage;
  try {
    processed = await processAndValidateImage(file.buffer, file.mimetype);
  } catch (err) {
    throw new ValidationError((err as Error).message);
  }

  const photoId = crypto.randomUUID();

  // Upload processed buffer to storage
  const storagePath = await uploadListingPhotoToStorage({
    listingId,
    photoId,
    buffer: processed.buffer,
    contentType: processed.contentType,
    extension: processed.extension,
  });

  // Insert into DB with rollback handling if DB write fails
  try {
    const photoRecord = await createListingPhoto(
      {
        id: photoId,
        listingId,
        storagePath,
        displayOrder: existingPhotoCount,
        altText: altText || file.originalname || 'Listing photo',
      },
      dbOverride
    );

    return {
      ...photoRecord,
      publicUrl: getPhotoPublicUrl(storagePath),
    };
  } catch (dbErr) {
    // Rollback: clean up orphaned file in storage if DB insert fails
    await deleteListingPhotoFromStorage(storagePath);
    throw dbErr;
  }
}

export async function deletePhotoFromListing(
  listingId: string,
  photoId: string,
  requestingUserId: string,
  dbOverride?: DbInstance
): Promise<boolean> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to modify photos for this listing');
  }

  if (isTerminalListingStatus(listing.status)) {
    throw new ValidationError(`Cannot delete photos from a listing in terminal state '${listing.status}'`);
  }

  const photo = await findPhotoById(photoId, dbOverride);
  if (!photo || photo.listingId !== listingId) {
    throw new NotFoundError('Photo not found');
  }

  await deleteListingPhoto(photoId, dbOverride);
  await deleteListingPhotoFromStorage(photo.storagePath);

  // Compact display orders
  const remainingPhotos = await findPhotosByListingId(listingId, dbOverride);
  await updatePhotoOrder(
    listingId,
    remainingPhotos.map((p) => p.id),
    dbOverride
  );

  return true;
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
  dbOverride?: DbInstance
): Promise<Listing> {
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
