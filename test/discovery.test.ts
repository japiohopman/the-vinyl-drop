/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { createApp } from '../src/app';
import { setSupabaseClient } from '../src/lib/supabase';
import { execSync } from 'child_process';
import * as listingService from '../src/app/services/listingService';
import * as commentService from '../src/app/services/commentService';
import * as profileRepository from '../src/app/repositories/profileRepository';
import { NotFoundError, ValidationError } from '../src/app/services/errors';
import { Profile } from '../src/db/schema/profiles';
import { Listing } from '../src/db/schema/listings';
import { Release } from '../src/db/schema/releases';
import { PhysicalCopy } from '../src/db/schema/physicalCopies';

jest.mock('../src/app/services/listingService');
jest.mock('../src/app/services/commentService');
jest.mock('../src/app/repositories/profileRepository');

describe('Phase 5 — Discovery, Search, Listing Detail, Seller Profile & Comments', () => {
  let mockSupabase: any;

  const mockUserAlice = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'alice@example.com',
  };

  const mockProfileAlice: Profile = {
    id: mockUserAlice.id,
    username: 'alice_records',
    displayName: 'Alice Vinyl',
    avatarUrl: 'https://example.com/alice.jpg',
    websiteUrl: null,
    bio: 'Crate digger & soul collector.',
    location: 'Berlin, DE',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockUserBob = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'bob@example.com',
  };

  const mockProfileBob: Profile = {
    id: mockUserBob.id,
    username: 'bob_grooves',
    displayName: 'Bob Grooves',
    avatarUrl: null,
    websiteUrl: null,
    bio: null,
    location: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockRelease: Release = {
    id: 'rel-1111-1111-1111',
    title: 'Blue Train',
    artist: 'John Coltrane',
    label: 'Blue Note',
    catalogueNumber: 'BLP 1577',
    releaseYear: 1957,
    country: 'US',
    format: '12" Vinyl',
    barcode: null,
    genre: 'Jazz',
    coverArtUrl: null,
    externalSource: null,
    externalId: null,
    lastImportedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPhysicalCopy: PhysicalCopy = {
    id: 'copy-1111-1111-1111',
    releaseId: mockRelease.id,
    ownerId: mockUserAlice.id,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
    notes: 'Minor corner crease',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPublishedListing: Listing = {
    id: 'list-1111-1111-1111',
    physicalCopyId: mockPhysicalCopy.id,
    sellerId: mockUserAlice.id,
    price: 3500,
    currency: 'EUR',
    tradeAvailable: true,
    description: 'Original pressing in great shape.',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDraftListing: Listing = {
    ...mockPublishedListing,
    id: 'list-2222-2222-2222',
    status: 'draft',
  };

  const mockListingCard = {
    id: mockPublishedListing.id,
    title: mockRelease.title,
    artist: mockRelease.artist,
    releaseYear: mockRelease.releaseYear,
    format: mockRelease.format,
    priceFormatted: '€35.00',
    isTrade: true,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
    imageUrl: '/assets/test-cover.webp',
    imageAlt: 'Album cover artwork for Blue Train by John Coltrane',
    sellerUsername: mockProfileAlice.username,
    sellerLocation: mockProfileAlice.location,
    url: `/listings/${mockPublishedListing.id}`,
  };

  const mockDetailedListing = {
    listing: mockPublishedListing,
    physicalCopy: mockPhysicalCopy,
    release: mockRelease,
    seller: mockProfileAlice,
    photos: [
      {
        id: 'photo-1',
        listingId: mockPublishedListing.id,
        storagePath: 'assets/test-cover.webp',
        publicUrl: '/assets/test-cover.webp',
        displayOrder: 0,
        altText: 'Album cover artwork for Blue Train by John Coltrane',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  const mockComment = {
    id: 'comment-1111',
    listingId: mockPublishedListing.id,
    authorId: mockUserBob.id,
    content: 'Is this an original US Mono pressing?',
    createdAt: new Date('2025-01-02T10:00:00Z'),
    updatedAt: new Date('2025-01-02T10:00:00Z'),
    author: {
      id: mockProfileBob.id,
      username: mockProfileBob.username,
      displayName: mockProfileBob.displayName,
      avatarUrl: mockProfileBob.avatarUrl,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: jest.fn(),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    };

    setSupabaseClient(mockSupabase);
  });

  describe('Homepage Feed (GET /)', () => {
    it('should render homepage feed with published listing cards when drops exist', async () => {
      (listingService.getHomeFeedListings as jest.Mock).mockResolvedValue([mockListingCard]);

      const app = createApp();
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Blue Train');
      expect(res.text).toContain('John Coltrane');
      expect(res.text).toContain('€35.00');
      expect(res.text).toContain('Recent Drops');
    });

    it('should render accessible empty state on homepage when no published drops exist', async () => {
      (listingService.getHomeFeedListings as jest.Mock).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.text).toContain('No recent drops yet');
      expect(res.text).toContain('Be the first to list a vinyl record');
    });
  });

  describe('Browse & PostgreSQL Search (GET /browse & GET /search)', () => {
    it('should handle search keywords and filter parameters on GET /browse', async () => {
      (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
        items: [mockListingCard],
        totalCount: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app)
        .get('/browse?q=Coltrane&genre=Jazz&condition=VG%2B&minPrice=10&maxPrice=50&sort=price_asc');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Coltrane');
      expect(res.text).toContain('Blue Train');
      expect(listingService.searchBrowseListings).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'Coltrane',
          genre: 'Jazz',
          condition: 'VG+',
          minPrice: 1000,
          maxPrice: 5000,
          sort: 'price_asc',
          page: 1,
        })
      );
    });

    it('should render empty search results state when query matches no drops', async () => {
      (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
        items: [],
        totalCount: 0,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app).get('/browse?q=NonExistentArtist123');

      expect(res.status).toBe(200);
      expect(res.text).toContain('No records match your search');
      expect(res.text).toContain('Clear Filters');
    });

    it('should delegate GET /search directly to browse controller', async () => {
      (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
        items: [mockListingCard],
        totalCount: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app).get('/search?q=Blue');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Blue Train');
    });
  });

  describe('Phase 6B — Product Polish UI Enhancements', () => {
    it('should render mobile menu toggle and icon/manifest links in HTML <head>', async () => {
      (listingService.getHomeFeedListings as jest.Mock).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.text).toContain('<link rel="icon" type="image/x-icon" href="/favicon.ico">');
      expect(res.text).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">');
      expect(res.text).toContain('<link rel="manifest" href="/site.webmanifest">');

      // Verify icon links are inside <head> before <body>
      const headEnd = res.text.indexOf('</head>');
      const bodyStart = res.text.indexOf('<body>');
      const faviconIndex = res.text.indexOf('/favicon.ico');
      expect(headEnd).toBeGreaterThan(-1);
      expect(faviconIndex).toBeLessThan(headEnd);
      expect(faviconIndex).toBeLessThan(bodyStart);

      expect(res.text).toContain('id="nav-toggle-btn"');
      expect(res.text).toContain('aria-expanded="false"');
      expect(res.text).toContain('aria-controls="primary-nav-list"');
      expect(res.text).toContain('aria-label="Toggle navigation menu"');
    });

    it('should verify favicon.ico has valid ICO binary magic header bytes', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const icoBuffer = fs.readFileSync(path.join(process.cwd(), 'public/favicon.ico'));

      // Magic header: 0x00 0x00 0x01 0x00
      expect(icoBuffer[0]).toBe(0);
      expect(icoBuffer[1]).toBe(0);
      expect(icoBuffer[2]).toBe(1);
      expect(icoBuffer[3]).toBe(0);
    });

    it('should resolve all static favicon, touch icon, PWA icon, and webmanifest URLs with 200 OK', async () => {
      const app = createApp();

      const resIco = await request(app).get('/favicon.ico');
      expect(resIco.status).toBe(200);

      const res16 = await request(app).get('/favicon-16x16.png');
      expect(res16.status).toBe(200);

      const res32 = await request(app).get('/favicon-32x32.png');
      expect(res32.status).toBe(200);

      const resTouch = await request(app).get('/apple-touch-icon.png');
      expect(resTouch.status).toBe(200);

      const res192 = await request(app).get('/android-chrome-192x192.png');
      expect(res192.status).toBe(200);

      const res512 = await request(app).get('/android-chrome-512x512.png');
      expect(res512.status).toBe(200);

      const resManifest = await request(app).get('/site.webmanifest');
      expect(resManifest.status).toBe(200);
      expect(resManifest.text).toContain('The Vinyl Drop');
    });

    it('should default to grid view on GET /browse and render grid presentation button active', async () => {
      (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
        items: [mockListingCard],
        totalCount: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app).get('/browse');

      expect(res.status).toBe(200);
      expect(res.text).toContain('class="listing-grid"');
      expect(res.text).toContain('aria-label="Grid view"');
      expect(res.text).toContain('aria-current="page"');
    });

    it('should render list view presentation on GET /browse?view=list and preserve query filters', async () => {
      (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
        items: [mockListingCard],
        totalCount: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app).get('/browse?q=Coltrane&genre=Jazz&view=list');

      expect(res.status).toBe(200);
      expect(res.text).toContain('class="listing-list"');
      expect(res.text).toContain('listing-card-list-mode');
      expect(res.text).toContain('aria-label="List view"');
      expect(res.text).toContain('aria-current="page"');
      expect(res.text).toContain('q=Coltrane');
    });

    it('should safely fall back to grid view when invalid view parameter is provided', async () => {
      (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
        items: [mockListingCard],
        totalCount: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app).get('/browse?view=invalid_mode');

      expect(res.status).toBe(200);
      expect(res.text).toContain('class="listing-grid"');
      expect(res.text).toContain('aria-current="page"');
    });

    it('should render compact record context banner in comment thread on listing detail page', async () => {
      (listingService.getListingWithDetailsForView as jest.Mock).mockResolvedValue(mockDetailedListing);
      (commentService.getListingComments as jest.Mock).mockResolvedValue([mockComment]);

      const app = createApp();
      const res = await request(app).get(`/listings/${mockPublishedListing.id}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('class="comment-thread-context"');
      expect(res.text).toContain('Discussing drop');
      expect(res.text).toContain('Blue Train');
      expect(res.text).toContain('John Coltrane');
    });
  });

  describe('Listing Detail View & Authorization Boundaries (GET /listings/:id)', () => {
    it('should render public listing detail page for published listings', async () => {
      (listingService.getListingWithDetailsForView as jest.Mock).mockResolvedValue(mockDetailedListing);
      (commentService.getListingComments as jest.Mock).mockResolvedValue([mockComment]);

      const app = createApp();
      const res = await request(app).get(`/listings/${mockPublishedListing.id}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Blue Train');
      expect(res.text).toContain('John Coltrane');
      expect(res.text).toContain('Blue Note');
      expect(res.text).toContain('Is this an original US Mono pressing?');
      expect(res.text).toContain('Sign in to post a comment');
    });

    it('should return 404 Not Found when attempting to view non-existent or unpublished listing as unauthorized user', async () => {
      (listingService.getListingWithDetailsForView as jest.Mock).mockRejectedValue(
        new NotFoundError('Listing not found')
      );

      const app = createApp();
      const res = await request(app).get(`/listings/${mockDraftListing.id}`);

      expect(res.status).toBe(404);
      expect(res.text).toContain('404 - Page Not Found');
    });
  });

  describe('Authenticated Comment Creation & CSRF (POST /listings/:id/comments)', () => {
    it('should redirect unauthenticated users attempting to post comments to /auth/login', async () => {
      const app = createApp();
      const res = await request(app)
        .post(`/listings/${mockPublishedListing.id}/comments`)
        .send({ content: 'Nice copy!' });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/auth/login');
    });

    it('should enforce CSRF origin/referer protection on comment creation', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserBob },
        error: null,
      });

      const app = createApp();
      const res = await request(app)
        .post(`/listings/${mockPublishedListing.id}/comments`)
        .set('Cookie', ['sb-access-token=bob-token'])
        .send({ content: 'Nice copy!' });

      expect(res.status).toBe(403);
      expect(res.text).toContain('CSRF Forbidden');
    });

    it('should post comment and redirect to #comments when authenticated and origin is valid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserBob },
        error: null,
      });

      (commentService.addComment as jest.Mock).mockResolvedValue({
        id: 'comment-999',
        listingId: mockPublishedListing.id,
        authorId: mockUserBob.id,
        content: 'Is shipping included?',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = createApp();
      const res = await request(app)
        .post(`/listings/${mockPublishedListing.id}/comments`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', ['sb-access-token=bob-token'])
        .send({ content: 'Is shipping included?' });

      expect(res.status).toBe(302);
      expect(res.header.location).toBe(`/listings/${mockPublishedListing.id}#comments`);
      expect(commentService.addComment).toHaveBeenCalledWith(
        mockPublishedListing.id,
        mockUserBob.id,
        'Is shipping included?'
      );
    });

    it('should return 400 Bad Request when posting invalid or empty comment', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserBob },
        error: null,
      });

      (commentService.addComment as jest.Mock).mockRejectedValue(
        new ValidationError('Invalid comment: Comment cannot be empty')
      );
      (listingService.getListingWithDetailsForView as jest.Mock).mockResolvedValue(mockDetailedListing);
      (commentService.getListingComments as jest.Mock).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app)
        .post(`/listings/${mockPublishedListing.id}/comments`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', ['sb-access-token=bob-token'])
        .send({ content: '   ' });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Comment cannot be empty');
    });

    it('should return 404 Not Found when authenticated non-seller attempts to post comment on an unpublished/draft listing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserBob },
        error: null,
      });

      (commentService.addComment as jest.Mock).mockRejectedValue(
        new NotFoundError('Listing not found')
      );

      const app = createApp();
      const res = await request(app)
        .post(`/listings/${mockDraftListing.id}/comments`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', ['sb-access-token=bob-token'])
        .send({ content: 'Is this draft listing available?' });

      expect(res.status).toBe(404);
      expect(res.text).toContain('404 - Page Not Found');
    });
  });

  describe('Public Seller Profile View (GET /profiles/:username & GET /profile/:username)', () => {
    it('should render public seller profile with active published drops', async () => {
      (profileRepository.findProfileByUsername as jest.Mock).mockResolvedValue(mockProfileAlice);
      (listingService.getSellerPublishedListings as jest.Mock).mockResolvedValue({
        items: [mockListingCard],
        totalCount: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app).get('/profiles/alice_records');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Alice Vinyl');
      expect(res.text).toContain('@alice_records');
      expect(res.text).toContain('1 record for sale');
      expect(res.text).toContain('Blue Train');
    });

    it('should render seller profile empty state when seller has 0 active drops', async () => {
      (profileRepository.findProfileByUsername as jest.Mock).mockResolvedValue(mockProfileBob);
      (listingService.getSellerPublishedListings as jest.Mock).mockResolvedValue({
        items: [],
        totalCount: 0,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const app = createApp();
      const res = await request(app).get('/profile/bob_grooves');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Bob Grooves');
      expect(res.text).toContain('@bob_grooves has no active record drops available right now.');
    });

    it('should handle pagination for seller profile listings (12 items per page)', async () => {
      (profileRepository.findProfileByUsername as jest.Mock).mockResolvedValue(mockProfileAlice);
      (listingService.getSellerPublishedListings as jest.Mock).mockResolvedValue({
        items: [mockListingCard],
        totalCount: 15,
        page: 2,
        limit: 12,
        totalPages: 2,
      });

      const app = createApp();
      const res = await request(app).get('/profiles/alice_records?page=2');

      expect(res.status).toBe(200);
      expect(listingService.getSellerPublishedListings).toHaveBeenCalledWith('alice_records', { page: 2 });
      expect(res.text).toContain('Page 2 of 2');
    });

    it('should return 400 Bad Request when malformed page parameter is provided to seller profile', async () => {
      (profileRepository.findProfileByUsername as jest.Mock).mockResolvedValue(mockProfileAlice);

      const app = createApp();
      const res = await request(app).get('/profiles/alice_records?page=invalid123');

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid page parameter provided.');
    });
  });

  describe('Strict Query Parameter Validation (minPrice, maxPrice, page)', () => {
    it('should return 400 Bad Request when minPrice is malformed e.g. 12abc or negative', async () => {
      const app = createApp();
      const res1 = await request(app).get('/browse?minPrice=12abc');
      expect(res1.status).toBe(400);
      expect(res1.text).toContain('Invalid search filter or page parameters provided.');

      const res2 = await request(app).get('/browse?minPrice=-10');
      expect(res2.status).toBe(400);
    });

    it('should return 400 Bad Request when maxPrice is malformed e.g. 50euro or negative', async () => {
      const app = createApp();
      const res = await request(app).get('/browse?maxPrice=50euro');
      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid search filter or page parameters provided.');
    });

    it('should return 400 Bad Request when page is malformed e.g. 0, -1, 12abc, or float', async () => {
      const app = createApp();
      const res1 = await request(app).get('/browse?page=0');
      expect(res1.status).toBe(400);

      const res2 = await request(app).get('/browse?page=12abc');
      expect(res2.status).toBe(400);

      const res3 = await request(app).get('/browse?page=1.5');
      expect(res3.status).toBe(400);
    });
  });

  describe('Implementation Layer Verification via Executed Suite Script', () => {
    it('should verify discovery semantics via standalone verification script', () => {
      const output = execSync('npx tsx scripts/verify-discovery-semantics.ts', {
        encoding: 'utf8',
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/test',
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
        },
      });

      expect(output).toContain('Repository condition filter OR matching verified');
      expect(output).toContain('Repository price_asc and price_desc NULL trade-only sorting verified');
      expect(output).toContain('Seller profile listing service 12-item pagination contract verified');
      expect(output).toContain('Comment repository 50-item retrieval bound and chronological order verified');
    });
  });

  describe('Operational & Database Error Propagation', () => {
    it('should propagate database failure on GET / to error handler (500 status)', async () => {
      (listingService.getHomeFeedListings as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const app = createApp();
      const res = await request(app).get('/');

      expect(res.status).toBe(500);
      expect(res.text).toContain('500 - Server Error');
    });

    it('should propagate database failure on GET /browse to error handler (500 status)', async () => {
      (listingService.searchBrowseListings as jest.Mock).mockRejectedValue(
        new Error('Database query error')
      );

      const app = createApp();
      const res = await request(app).get('/browse');

      expect(res.status).toBe(500);
      expect(res.text).toContain('500 - Server Error');
    });

    it('should propagate database failure on GET /profiles/:username to error handler (500 status)', async () => {
      (profileRepository.findProfileByUsername as jest.Mock).mockResolvedValue(mockProfileAlice);
      (listingService.getSellerPublishedListings as jest.Mock).mockRejectedValue(
        new Error('Database query error')
      );

      const app = createApp();
      const res = await request(app).get('/profiles/alice_records');

      expect(res.status).toBe(500);
      expect(res.text).toContain('500 - Server Error');
    });
  });
});
