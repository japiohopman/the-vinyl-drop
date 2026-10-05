import { getDb } from '../../db';
import { ListingStatus } from '../../db/schema/enums';
import { Listing } from '../../db/schema/listings';
import { validateListingTransition } from '../../domain/listingLifecycle';
import {
  CreateListingInput,
  createListingSchema,
  UpdateListingInput,
  updateListingSchema,
} from '../../validators/listing';
import {
  createListing as createListingInRepo,
  findActiveListingByPhysicalCopyId,
  findListingById,
  findListingsBySellerId,
  updateListing as updateListingInRepo,
  updateListingStatus as updateStatusInRepo,
} from '../repositories/listingRepository';
import { findPhysicalCopyById } from '../repositories/physicalCopyRepository';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';

type DbInstance = ReturnType<typeof getDb>;

export async function getListingById(id: string, dbOverride?: DbInstance): Promise<Listing | null> {
  return findListingById(id, dbOverride);
}

export async function getUserListings(sellerId: string, dbOverride?: DbInstance): Promise<Listing[]> {
  return findListingsBySellerId(sellerId, dbOverride);
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

  // Verify referenced physical copy exists and is owned by seller
  const physicalCopy = await findPhysicalCopyById(data.physicalCopyId, dbOverride);
  if (!physicalCopy) {
    throw new NotFoundError('Referenced PhysicalCopy does not exist');
  }

  if (physicalCopy.ownerId !== data.sellerId) {
    throw new AuthorizationError('PhysicalCopy does not belong to the seller');
  }

  // Prevent multiple active published/reserved listings for the same physical copy
  if (data.status === 'published' || data.status === 'reserved') {
    const activeListing = await findActiveListingByPhysicalCopyId(data.physicalCopyId, dbOverride);
    if (activeListing) {
      throw new ValidationError('An active listing already exists for this physical copy');
    }
  }

  return createListingInRepo(
    {
      physicalCopyId: data.physicalCopyId,
      sellerId: data.sellerId,
      price: data.price ?? null,
      currency: data.currency || 'EUR',
      tradeAvailable: data.tradeAvailable ?? false,
      description: data.description || null,
      status: data.status || 'draft',
    },
    dbOverride
  );
}

export async function updateListing(
  listingId: string,
  requestingUserId: string,
  input: UpdateListingInput,
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

  // Validate status transition and lifecycle invariants
  validateListingTransition({
    currentStatus: existingListing.status,
    targetStatus,
    price: targetPrice,
    tradeAvailable: targetTradeAvailable,
  });

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
