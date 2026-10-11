import { Request } from 'express';
import { createExpressSupabaseClient, getSupabaseClient } from '../src/lib/supabase';
import {
  uploadListingPhotoToStorage,
  deleteListingPhotoFromStorage,
  getPhotoPublicUrl,
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
