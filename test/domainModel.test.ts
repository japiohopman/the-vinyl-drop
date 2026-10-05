import {
  canTransitionListingStatus,
  getAllowedNextStatuses,
  InvalidLifecycleTransitionError,
  validateListingTransition,
} from '../src/domain/listingLifecycle';
import { createListingSchema, listingSchema } from '../src/validators/listing';
import { physicalCopySchema } from '../src/validators/physicalCopy';
import { createPhysicalCopy, updatePhysicalCopy } from '../src/app/services/physicalCopyService';
import { createListing, updateListing, transitionListingStatus } from '../src/app/services/listingService';
import { createRelease } from '../src/app/services/releaseService';
import { AuthorizationError, NotFoundError, ValidationError } from '../src/app/services/errors';

// Mock repository functions to test service layer logic and domain boundaries cleanly
jest.mock('../src/app/repositories/releaseRepository');
jest.mock('../src/app/repositories/physicalCopyRepository');
jest.mock('../src/app/repositories/listingRepository');

import * as releaseRepo from '../src/app/repositories/releaseRepository';
import * as copyRepo from '../src/app/repositories/physicalCopyRepository';
import * as listingRepo from '../src/app/repositories/listingRepository';

describe('Phase 4A Domain Model & Lifecycle Rules', () => {
  const sellerId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const releaseId = '33333333-3333-4333-a333-333333333333';
  const copyId = '44444444-4444-4444-a444-444444444444';
  const listingId = '55555555-5555-4555-a555-555555555555';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validators: PhysicalCopy and Listing Schemas', () => {
    it('should validate valid physical copy schema', () => {
      const valid = physicalCopySchema.safeParse({
        releaseId,
        ownerId: sellerId,
        mediaCondition: 'VG+',
        sleeveCondition: 'NM',
        notes: 'Original pressing in great shape.',
      });
      expect(valid.success).toBe(true);
    });

    it('should reject invalid condition grades in physical copy schema', () => {
      const invalid = physicalCopySchema.safeParse({
        releaseId,
        ownerId: sellerId,
        mediaCondition: 'EXCELLENT', // invalid
        sleeveCondition: 'NM',
      });
      expect(invalid.success).toBe(false);
    });

    it('should validate monetary price stored strictly as non-negative integer minor currency units', () => {
      const validListing = listingSchema.safeParse({
        physicalCopyId: copyId,
        sellerId,
        price: 3495, // €34.95
        currency: 'EUR',
        tradeAvailable: false,
        status: 'draft',
      });
      expect(validListing.success).toBe(true);

      const invalidFloatPrice = listingSchema.safeParse({
        physicalCopyId: copyId,
        sellerId,
        price: 34.95, // float is forbidden
      });
      expect(invalidFloatPrice.success).toBe(false);

      const invalidNegativePrice = listingSchema.safeParse({
        physicalCopyId: copyId,
        sellerId,
        price: -500, // negative price is forbidden
      });
      expect(invalidNegativePrice.success).toBe(false);
    });

    it('should allow null price when tradeAvailable is true', () => {
      const tradeListing = createListingSchema.safeParse({
        physicalCopyId: copyId,
        sellerId,
        price: null,
        currency: 'EUR',
        tradeAvailable: true,
        status: 'published',
      });
      expect(tradeListing.success).toBe(true);
    });

    it('should reject published status if neither price > 0 nor tradeAvailable is present', () => {
      const result = createListingSchema.safeParse({
        physicalCopyId: copyId,
        sellerId,
        price: null,
        currency: 'EUR',
        tradeAvailable: false,
        status: 'published',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Domain Lifecycle Rules (Listing State Machine)', () => {
    it('should correctly determine permitted direct transitions', () => {
      expect(canTransitionListingStatus('draft', 'published')).toBe(true);
      expect(canTransitionListingStatus('draft', 'archived')).toBe(true);
      expect(canTransitionListingStatus('draft', 'sold')).toBe(false); // cannot jump draft to sold directly

      expect(canTransitionListingStatus('published', 'reserved')).toBe(true);
      expect(canTransitionListingStatus('published', 'sold')).toBe(true);
      expect(canTransitionListingStatus('published', 'traded')).toBe(true);
      expect(canTransitionListingStatus('published', 'draft')).toBe(true);
      expect(canTransitionListingStatus('published', 'archived')).toBe(true);

      expect(canTransitionListingStatus('reserved', 'sold')).toBe(true);
      expect(canTransitionListingStatus('reserved', 'published')).toBe(true);

      expect(canTransitionListingStatus('sold', 'archived')).toBe(true);
      expect(canTransitionListingStatus('sold', 'published')).toBe(false);

      expect(canTransitionListingStatus('archived', 'draft')).toBe(true);
      expect(canTransitionListingStatus('archived', 'published')).toBe(false);
    });

    it('should return correct allowed next statuses list', () => {
      expect(getAllowedNextStatuses('draft')).toEqual(['published', 'archived']);
      expect(getAllowedNextStatuses('sold')).toEqual(['archived']);
    });

    it('should throw InvalidLifecycleTransitionError for disallowed structural transitions', () => {
      expect(() =>
        validateListingTransition({
          currentStatus: 'draft',
          targetStatus: 'sold',
        })
      ).toThrow(InvalidLifecycleTransitionError);
    });

    it('should enforce business rules during status transition', () => {
      // Transitioning to 'published' without price or trade must throw
      expect(() =>
        validateListingTransition({
          currentStatus: 'draft',
          targetStatus: 'published',
          price: null,
          tradeAvailable: false,
        })
      ).toThrow(InvalidLifecycleTransitionError);

      // Transitioning to 'traded' when tradeAvailable is false must throw
      expect(() =>
        validateListingTransition({
          currentStatus: 'published',
          targetStatus: 'traded',
          price: 2500,
          tradeAvailable: false,
        })
      ).toThrow(InvalidLifecycleTransitionError);
    });
  });

  describe('Service Layer Boundaries & Authorization Rules', () => {
    it('should enforce 1:N:1 separation across Release, PhysicalCopy, and Listing', async () => {
      // Mock release creation
      (releaseRepo.createRelease as jest.Mock).mockResolvedValue({
        id: releaseId,
        artist: 'Blue Mitchell',
        title: 'Blue’s Moods',
      });

      const release = await createRelease({ artist: 'Blue Mitchell', title: 'Blue’s Moods' });
      expect(release.id).toBe(releaseId);

      // Mock physical copy creation
      (releaseRepo.findReleaseById as jest.Mock).mockResolvedValue({ id: releaseId });
      (copyRepo.createPhysicalCopy as jest.Mock).mockResolvedValue({
        id: copyId,
        releaseId,
        ownerId: sellerId,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
      });

      const copy = await createPhysicalCopy(sellerId, {
        releaseId,
        ownerId: sellerId,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
      });

      expect(copy.id).toBe(copyId);
      expect(copy.releaseId).toBe(releaseId);

      // Mock listing creation
      (copyRepo.findPhysicalCopyById as jest.Mock).mockResolvedValue({ id: copyId, ownerId: sellerId });
      (listingRepo.findActiveListingByPhysicalCopyId as jest.Mock).mockResolvedValue(null);
      (listingRepo.createListing as jest.Mock).mockResolvedValue({
        id: listingId,
        physicalCopyId: copyId,
        sellerId,
        price: 4500,
        status: 'draft',
      });

      const listing = await createListing(sellerId, {
        physicalCopyId: copyId,
        sellerId,
        price: 4500,
        status: 'draft',
      });

      expect(listing.id).toBe(listingId);
      expect(listing.physicalCopyId).toBe(copyId);
      expect(listing.sellerId).toBe(sellerId);
    });

    it('should prevent non-owner from updating PhysicalCopy or Listing', async () => {
      (copyRepo.findPhysicalCopyById as jest.Mock).mockResolvedValue({
        id: copyId,
        ownerId: sellerId,
      });
      (listingRepo.findListingById as jest.Mock).mockResolvedValue({
        id: listingId,
        sellerId,
        status: 'draft',
        price: 2000,
      });

      await expect(
        updatePhysicalCopy(copyId, otherUserId, { notes: 'Unapproved' })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        updateListing(listingId, otherUserId, { price: 100 })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        transitionListingStatus(listingId, otherUserId, 'published')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should reject creating listing for non-existent physical copy or unowned copy', async () => {
      (copyRepo.findPhysicalCopyById as jest.Mock).mockResolvedValue(null);

      await expect(
        createListing(sellerId, {
          physicalCopyId: '00000000-0000-4000-a000-000000000000',
          sellerId,
          price: 1000,
        })
      ).rejects.toThrow(NotFoundError);

      // Unowned copy
      (copyRepo.findPhysicalCopyById as jest.Mock).mockResolvedValue({
        id: copyId,
        ownerId: otherUserId, // belongs to someone else
      });

      await expect(
        createListing(sellerId, {
          physicalCopyId: copyId,
          sellerId,
          price: 1000,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('should prevent duplicate active published/reserved listings for the same physical copy', async () => {
      (copyRepo.findPhysicalCopyById as jest.Mock).mockResolvedValue({ id: copyId, ownerId: sellerId });
      (listingRepo.findActiveListingByPhysicalCopyId as jest.Mock).mockResolvedValue({
        id: 'existing-active-listing',
        physicalCopyId: copyId,
        status: 'published',
      });

      await expect(
        createListing(sellerId, {
          physicalCopyId: copyId,
          sellerId,
          price: 2500,
          status: 'published',
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
