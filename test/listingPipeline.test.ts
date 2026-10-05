import supertest from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app';
import { parsePriceEurToCents } from '../src/validators/listing';
import { processAndValidateImage } from '../src/app/utils/imageProcessor';
import {
  createListingFromRelease,
  addPhotoToListing,
  deletePhotoFromListing,
  reorderListingPhotos,
  publishListing,
  archiveListing,
  getListingWithDetails,
} from '../src/app/services/listingService';
import { AuthorizationError, ValidationError } from '../src/app/services/errors';

// Mock repository functions for isolated unit testing
jest.mock('../src/app/repositories/releaseRepository');
jest.mock('../src/app/repositories/profileRepository');
jest.mock('../src/app/repositories/physicalCopyRepository');
jest.mock('../src/app/repositories/listingRepository');
jest.mock('../src/app/repositories/listingPhotoRepository');

import * as releaseRepo from '../src/app/repositories/releaseRepository';
import * as profileRepo from '../src/app/repositories/profileRepository';
import * as copyRepo from '../src/app/repositories/physicalCopyRepository';
import * as listingRepo from '../src/app/repositories/listingRepository';
import * as photoRepo from '../src/app/repositories/listingPhotoRepository';

const app = createApp();

describe('Phase 4B — Listing Creation, Editing, and Photo Pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Price Input Parsing (parsePriceEurToCents)', () => {
    it('should parse valid Euro decimal strings to integer minor currency units (cents)', () => {
      expect(parsePriceEurToCents('24.95')).toBe(2495);
      expect(parsePriceEurToCents('0.99')).toBe(99);
      expect(parsePriceEurToCents('100')).toBe(10000);
      expect(parsePriceEurToCents(15.5)).toBe(1550);
    });

    it('should return null for empty or missing price inputs (trade-only)', () => {
      expect(parsePriceEurToCents('')).toBeNull();
      expect(parsePriceEurToCents(null)).toBeNull();
      expect(parsePriceEurToCents(undefined)).toBeNull();
    });

    it('should throw an error for negative prices or invalid numeric strings', () => {
      expect(() => parsePriceEurToCents('-10')).toThrow('Price cannot be negative');
      expect(() => parsePriceEurToCents('abc')).toThrow('Price must be a valid number');
    });
  });

  describe('Sharp Image Processing Pipeline (processAndValidateImage)', () => {
    it('should process a valid JPEG image, strip metadata, and convert to optimized WebP', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 800,
          height: 800,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .jpeg()
        .toBuffer();

      const processed = await processAndValidateImage(inputBuffer, 'image/jpeg');

      expect(processed.contentType).toBe('image/webp');
      expect(processed.extension).toBe('webp');
      expect(processed.width).toBe(800);
      expect(processed.height).toBe(800);
      expect(processed.buffer.length).toBeGreaterThan(0);
    });

    it('should downscale images exceeding maximum dimension (2048px)', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 3000,
          height: 1500,
          channels: 3,
          background: { r: 50, g: 100, b: 200 },
        },
      })
        .jpeg()
        .toBuffer();

      const processed = await processAndValidateImage(inputBuffer, 'image/jpeg');

      expect(processed.width).toBe(2048);
      expect(processed.height).toBe(1024);
    });

    it('should reject non-image binaries or invalid MIME types', async () => {
      const textBuffer = Buffer.from('This is a text file, not an image.');
      await expect(processAndValidateImage(textBuffer, 'text/plain')).rejects.toThrow();
    });
  });

  describe('Listing & Photo Domain Service Integration', () => {
    const sellerId = '10000000-0000-4000-8000-000000000001';
    const otherUserId = '20000000-0000-4000-8000-000000000002';
    const releaseId = '30000000-0000-4000-8000-000000000003';
    const copyId = '40000000-0000-4000-8000-000000000004';
    const listingId = '50000000-0000-4000-8000-000000000005';

    beforeEach(() => {
      (profileRepo.findProfileById as jest.Mock).mockImplementation((id) =>
        Promise.resolve({ id, username: id === sellerId ? 'vinyl_seller' : 'other_user', displayName: 'User' })
      );

      (releaseRepo.findReleaseById as jest.Mock).mockResolvedValue({
        id: releaseId,
        artist: 'Blue Note All-Stars',
        title: 'Blue Spirits',
        label: 'Blue Note',
        releaseYear: 1965,
        format: 'Vinyl, LP',
      });

      (copyRepo.findPhysicalCopyById as jest.Mock).mockResolvedValue({
        id: copyId,
        releaseId,
        ownerId: sellerId,
        mediaCondition: 'NM',
        sleeveCondition: 'VG+',
      });

      (copyRepo.createPhysicalCopy as jest.Mock).mockResolvedValue({
        id: copyId,
        releaseId,
        ownerId: sellerId,
        mediaCondition: 'NM',
        sleeveCondition: 'VG+',
      });

      (listingRepo.createListing as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ id: listingId, ...data })
      );

      (listingRepo.findListingById as jest.Mock).mockResolvedValue({
        id: listingId,
        physicalCopyId: copyId,
        sellerId,
        price: 2999,
        currency: 'EUR',
        tradeAvailable: true,
        status: 'draft',
      });

      (photoRepo.findPhotosByListingId as jest.Mock).mockResolvedValue([]);
      (photoRepo.countPhotosByListingId as jest.Mock).mockResolvedValue(0);
      (photoRepo.createListingPhoto as jest.Mock).mockImplementation((data) => Promise.resolve({ ...data }));
    });

    it('should create a draft listing linked to a release and physical copy', async () => {
      const listing = await createListingFromRelease(sellerId, {
        releaseId,
        mediaCondition: 'NM',
        sleeveCondition: 'VG+',
        priceEur: '29.99',
        tradeAvailable: true,
        description: 'Original press in fantastic shape',
      });

      expect(listing.id).toBeDefined();
      expect(listing.sellerId).toBe(sellerId);
      expect(listing.price).toBe(2999);
      expect(listing.tradeAvailable).toBe(true);
      expect(listing.status).toBe('draft');

      const details = await getListingWithDetails(listing.id);
      expect(details).not.toBeNull();
      expect(details?.release.title).toBe('Blue Spirits');
      expect(details?.physicalCopy.mediaCondition).toBe('NM');
    });

    it('should upload photos up to maximum limit (5) and reorder them', async () => {
      const sampleImage = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      const photo1 = await addPhotoToListing(listingId, sellerId, {
        buffer: sampleImage,
        mimetype: 'image/jpeg',
        originalname: 'front_sleeve.jpg',
      }, 'Front sleeve photo');

      expect(photo1.displayOrder).toBe(0);

      (photoRepo.findPhotosByListingId as jest.Mock).mockResolvedValue([
        { id: 'p1', listingId, storagePath: 'listings/1/p1.webp', displayOrder: 0 },
        { id: 'p2', listingId, storagePath: 'listings/1/p2.webp', displayOrder: 1 },
      ]);

      const reordered = await reorderListingPhotos(listingId, sellerId, ['p2', 'p1']);
      expect(reordered[0].id).toBe('p1');

      (photoRepo.findPhotoById as jest.Mock).mockResolvedValue({ id: 'p1', listingId, storagePath: 'listings/1/p1.webp' });
      await deletePhotoFromListing(listingId, 'p1', sellerId);
      expect(photoRepo.deleteListingPhoto).toHaveBeenCalledWith('p1', undefined);
    });

    it('should enforce photo limit of 5 photos per listing', async () => {
      (photoRepo.countPhotosByListingId as jest.Mock).mockResolvedValue(5);

      const sampleImage = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      await expect(
        addPhotoToListing(listingId, sellerId, {
          buffer: sampleImage,
          mimetype: 'image/jpeg',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should enforce seller ownership for photo operations and state transitions', async () => {
      const sampleImage = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } },
      })
        .jpeg()
        .toBuffer();

      // Non-seller cannot upload photos
      await expect(
        addPhotoToListing(listingId, otherUserId, {
          buffer: sampleImage,
          mimetype: 'image/jpeg',
        })
      ).rejects.toThrow(AuthorizationError);

      // Non-seller cannot publish listing
      await expect(publishListing(listingId, otherUserId)).rejects.toThrow(AuthorizationError);
    });

    it('should transition draft listing to published and archived', async () => {
      (listingRepo.updateListingStatus as jest.Mock).mockImplementation((id, status) =>
        Promise.resolve({ id, sellerId, status, price: 3500, tradeAvailable: false })
      );

      const published = await publishListing(listingId, sellerId);
      expect(published.status).toBe('published');

      (listingRepo.findListingById as jest.Mock).mockResolvedValue({
        id: listingId,
        sellerId,
        price: 3500,
        currency: 'EUR',
        tradeAvailable: false,
        status: 'published',
      });

      const archived = await archiveListing(listingId, sellerId);
      expect(archived.status).toBe('archived');
    });
  });

  describe('HTTP Endpoints (/listings)', () => {
    it('GET /listings should redirect unauthenticated requests to login', async () => {
      const response = await supertest(app).get('/listings');
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/auth/login');
    });

    it('GET /health should confirm health check status', async () => {
      const response = await supertest(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });
});
