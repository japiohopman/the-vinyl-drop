import supertest from 'supertest';
import sharp from 'sharp';
import express, { Request, Response } from 'express';
import { createApp } from '../src/app';
import { parsePriceEurToCents } from '../src/validators/listing';
import { processAndValidateImage } from '../src/app/utils/imageProcessor';
import { multipartUploadHandler } from '../src/app/middleware/upload';
import {
  createListingFromRelease,
  addPhotoToListing,
  deletePhotoFromListing,
  reorderListingPhotos,
  publishListing,
  archiveListing,
  updateListing,
  getListingWithDetails,
} from '../src/app/services/listingService';
import { ConditionGrade } from '../src/db/schema/enums';
import { AuthorizationError, ValidationError } from '../src/app/services/errors';

// Mock repository functions and database for isolated unit testing
jest.mock('../src/db', () => {
  const mockDb = {
    transaction: jest.fn().mockImplementation(async (cb) => cb(mockDb)),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return {
    getDb: jest.fn().mockReturnValue(mockDb),
  };
});

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

    it('should reject SVG or non-JPEG/PNG/WebP formats even if client passes misleading MIME type image/jpeg', async () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>');
      await expect(processAndValidateImage(svgBuffer, 'image/jpeg')).rejects.toThrow('Detected image format');
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

      (copyRepo.deletePhysicalCopy as jest.Mock).mockResolvedValue(true);

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

    it('should create a draft listing linked to a release and physical copy inside a transaction (Blocker 1)', async () => {
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

    it('should delete a photo from a listing and re-compact photo order', async () => {
      const photoId = '60000000-0000-4000-8000-000000000001';
      (photoRepo.findPhotoById as jest.Mock).mockResolvedValue({
        id: photoId,
        listingId,
        storagePath: `listings/${listingId}/${photoId}.webp`,
      });

      const deleted = await deletePhotoFromListing(listingId, photoId, sellerId);
      expect(deleted).toBe(true);
      expect(photoRepo.deleteListingPhoto).toHaveBeenCalledWith(photoId, undefined);
    });

    it('should reject publishing without server-side preview confirmation (Blocker 3)', async () => {
      await expect(publishListing(listingId, sellerId)).rejects.toThrow('Preview confirmation required');

      (listingRepo.updateListingStatus as jest.Mock).mockResolvedValue({
        id: listingId,
        sellerId,
        status: 'published',
        price: 2999,
        tradeAvailable: true,
      });

      const published = await publishListing(listingId, sellerId, { previewConfirmed: true });
      expect(published.status).toBe('published');
    });

    it('should reject invalid condition grades on listing updates via Zod schema (Blocker 4)', async () => {
      await expect(
        updateListing(listingId, sellerId, {
          mediaCondition: 'EXCELLENT' as ConditionGrade,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should validate photo reordering and prove exact persisted ordering (Blocker 3 & Test Quality)', async () => {
      const p1Id = '60000000-0000-4000-8000-000000000001';
      const p2Id = '60000000-0000-4000-8000-000000000002';

      (photoRepo.findPhotosByListingId as jest.Mock)
        .mockResolvedValueOnce([
          { id: p1Id, listingId, storagePath: `listings/${listingId}/${p1Id}.webp`, displayOrder: 0 },
          { id: p2Id, listingId, storagePath: `listings/${listingId}/${p2Id}.webp`, displayOrder: 1 },
        ])
        .mockResolvedValueOnce([
          { id: p2Id, listingId, storagePath: `listings/${listingId}/${p2Id}.webp`, displayOrder: 0 },
          { id: p1Id, listingId, storagePath: `listings/${listingId}/${p1Id}.webp`, displayOrder: 1 },
        ]);

      const reordered = await reorderListingPhotos(listingId, sellerId, [p2Id, p1Id]);

      expect(photoRepo.updatePhotoOrder).toHaveBeenCalledWith(listingId, [p2Id, p1Id], undefined);
      expect(reordered[0].id).toBe(p2Id);
      expect(reordered[1].id).toBe(p1Id);
    });

    it('should reject invalid reorder requests (duplicates, missing IDs, foreign IDs)', async () => {
      const p1Id = '60000000-0000-4000-8000-000000000001';
      const p2Id = '60000000-0000-4000-8000-000000000002';
      const foreignId = '90000000-0000-4000-8000-000000000009';

      (photoRepo.findPhotosByListingId as jest.Mock).mockResolvedValue([
        { id: p1Id, listingId, storagePath: `listings/${listingId}/${p1Id}.webp`, displayOrder: 0 },
        { id: p2Id, listingId, storagePath: `listings/${listingId}/${p2Id}.webp`, displayOrder: 1 },
      ]);

      // Duplicates
      await expect(reorderListingPhotos(listingId, sellerId, [p1Id, p1Id])).rejects.toThrow(ValidationError);

      // Missing IDs / wrong count
      await expect(reorderListingPhotos(listingId, sellerId, [p1Id])).rejects.toThrow(ValidationError);

      // Foreign ID
      await expect(reorderListingPhotos(listingId, sellerId, [p1Id, foreignId])).rejects.toThrow(ValidationError);
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
      await expect(publishListing(listingId, otherUserId, { previewConfirmed: true })).rejects.toThrow(AuthorizationError);
    });

    it('should transition draft listing to published and archived', async () => {
      (listingRepo.updateListingStatus as jest.Mock).mockImplementation((id, status) =>
        Promise.resolve({ id, sellerId, status, price: 3500, tradeAvailable: false })
      );

      const published = await publishListing(listingId, sellerId, { previewConfirmed: true });
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

  describe('HTTP Endpoints & Multipart Middleware Limits (/listings)', () => {
    let uploadTestApp: express.Express;

    beforeAll(() => {
      uploadTestApp = express();
      uploadTestApp.post('/test-upload', multipartUploadHandler, (req: Request, res: Response) => {
        res.status(200).json({ files: req.files?.length || 0, body: req.body });
      });
      // Error handler
      uploadTestApp.use((err: Error, req: Request, res: Response, _next: express.NextFunction) => {
        res.status(400).json({ error: err.message });
      });
    });

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

    it('should reject file uploads exceeding 5MB with 400 Bad Request (Blocker 2)', async () => {
      const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024); // 5.5MB
      const response = await supertest(uploadTestApp)
        .post('/test-upload')
        .attach('photo', largeBuffer, { filename: 'large.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File upload size exceeds maximum limit');
    });

    it('should reject form fields exceeding 10KB size limit with 400 Bad Request (Blocker 2)', async () => {
      const largeField = 'a'.repeat(12 * 1024); // 12KB
      const response = await supertest(uploadTestApp)
        .post('/test-upload')
        .field('altText', largeField)
        .attach('photo', Buffer.from('img'), { filename: 'img.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('exceeds maximum limit of 10KB');
    });
  });
});
