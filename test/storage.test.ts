import { Request } from 'express';
import { createExpressSupabaseClient, getSupabaseClient } from '../src/lib/supabase';
import {
  uploadListingPhotoToStorage,
  deleteListingPhotoFromStorage,
  getListingPhotoCacheControl,
  getPhotoPublicUrl,
  restoreListingPhotoToStorage,
  downloadListingPhotoFromStorage,
  clearInMemoryStorage,
} from '../src/app/services/storageService';
import { config } from '../src/config/env';

describe('Storage Authorization and Service Boundaries (Issue #61)', () => {
  beforeEach(() => {
    clearInMemoryStorage();
  });

  describe('Supabase Client Authorization Headers', () => {
    it('should create Supabase client with global Authorization header when bearer token is passed', () => {
      const token = 'my-test-access-token';
      const client = createExpressSupabaseClient(undefined, undefined, token);
      /* eslint-disable @typescript-eslint/no-explicit-any */
      // Access storage client internal headers or global fetch config
      const storageFetchHeaders = (client.storage as any).headers || {};

      expect(storageFetchHeaders['Authorization'] || storageFetchHeaders['authorization']).toBe(`Bearer ${token}`);
    });

    it('should prioritize req.session.access_token over stale sb-access-token cookie', () => {
      const req = {
        session: {
          access_token: 'fresh-refreshed-session-token-456',
        },
        cookies: {
          'sb-access-token': 'stale-cookie-token-123',
        },
      } as unknown as Request;

      const client = getSupabaseClient(req);
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const storageFetchHeaders = (client.storage as any).headers || {};
      expect(storageFetchHeaders['Authorization'] || storageFetchHeaders['authorization']).toBe('Bearer fresh-refreshed-session-token-456');
    });

    it('should fallback to sb-access-token cookie if req.session is absent', () => {
      const req = {
        cookies: {
          'sb-access-token': 'cookie-access-token-123',
        },
      } as unknown as Request;

      const client = getSupabaseClient(req);
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const storageFetchHeaders = (client.storage as any).headers || {};
      expect(storageFetchHeaders['Authorization'] || storageFetchHeaders['authorization']).toBe('Bearer cookie-access-token-123');
    });

    it('should extract access token from Authorization header if cookies and session are missing', () => {
      const req = {
        headers: {
          authorization: 'Bearer bearer-token-xyz',
        },
      } as unknown as Request;

      const client = getSupabaseClient(req);
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const storageFetchHeaders = (client.storage as any).headers || {};
      expect(storageFetchHeaders['Authorization'] || storageFetchHeaders['authorization']).toBe('Bearer bearer-token-xyz');
    });
  });

  describe('Storage Public URL Formatting', () => {
    it('should return asset paths directly when storage path starts with / or assets/', () => {
      expect(getPhotoPublicUrl('assets/sample.png')).toBe('/assets/sample.png');
      expect(getPhotoPublicUrl('/static/logo.svg')).toBe('/static/logo.svg');
    });

    it('should generate expected Supabase Storage public URL when SUPABASE_URL is configured', () => {
      const path = 'listings/listing-123/photo-456.webp';
      const url = getPhotoPublicUrl(path);

      if (config.SUPABASE_URL && !config.SUPABASE_URL.includes('example.co')) {
        expect(url).toBe(`${config.SUPABASE_URL}/storage/v1/object/public/listing-photos/${path}`);
      } else {
        expect(url).toBe(`/mock-storage/${path}`);
      }
    });
  });

  describe('Listing photo cache policy', () => {
    it('uses short-lived browser caching for mutable public paths', () => {
      expect(getListingPhotoCacheControl('listings/listing-123/photo-456.webp')).toBe('3600');
    });

    it('allows one-day browser caching for UUID-versioned public derivatives', () => {
      expect(getListingPhotoCacheControl('listings/listing-123/photo-456.v-123e4567-e89b-42d3-a456-426614174000.webp')).toBe('86400');
    });

    it('does not treat an unrelated dotted filename as a versioned derivative', () => {
      expect(getListingPhotoCacheControl('listings/listing-123/photo-456.v-not-a-uuid.webp')).toBe('3600');
    });
  });

  describe('Listing photo restoration preserves immutable URLs', () => {
    it('keeps the existing URL when the restored bytes are unchanged', async () => {
      const original = Buffer.from('same photo bytes');
      const storagePath = await uploadListingPhotoToStorage({
        listingId: 'l1',
        photoId: 'p-identical',
        buffer: original,
        contentType: 'image/webp',
      });

      const restoredPath = await restoreListingPhotoToStorage(storagePath, Buffer.from(original));

      expect(restoredPath).toBe(storagePath);
      await expect(downloadListingPhotoFromStorage(storagePath)).resolves.toEqual(original);
    });

    it('uses a new versioned URL when existing bytes differ from the restore snapshot', async () => {
      const currentBytes = Buffer.from('newer photo bytes');
      const snapshotBytes = Buffer.from('older snapshot bytes');
      const storagePath = await uploadListingPhotoToStorage({
        listingId: 'l1',
        photoId: 'p-different',
        buffer: currentBytes,
        contentType: 'image/webp',
      });

      const restoredPath = await restoreListingPhotoToStorage(storagePath, snapshotBytes);

      expect(restoredPath).not.toBe(storagePath);
      expect(restoredPath).toMatch(
        /^listings\\/l1\\/p-different\\.v-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\\.webp$/i
      );
      expect(getListingPhotoCacheControl(restoredPath)).toBe('86400');
      await expect(downloadListingPhotoFromStorage(storagePath)).resolves.toEqual(currentBytes);
      await expect(downloadListingPhotoFromStorage(restoredPath)).resolves.toEqual(snapshotBytes);
    });
  });

  describe('In-Memory Mock Storage Operations (test mode)', () => {
    it('should upload and delete photos from in-memory mock storage in test environment', async () => {
      const buffer = Buffer.from('mock webp content');
      const path = await uploadListingPhotoToStorage({
        listingId: 'l1',
        photoId: 'p1',
        buffer,
        contentType: 'image/webp',
      });

      expect(path).toBe('listings/l1/p1.webp');
      expect(getPhotoPublicUrl(path)).toBe('/mock-storage/listings/l1/p1.webp');

      const deleted = await deleteListingPhotoFromStorage(path);
      expect(deleted).toBe(true);
    });
  });
});
