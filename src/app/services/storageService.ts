import { getSupabaseClient } from '../../lib/supabase';
import { config } from '../../config/env';

const BUCKET_NAME = 'listing-photos';

// In-memory mock storage map strictly for test environment
const inMemoryStorage = new Map<string, { buffer: Buffer; contentType: string }>();

export interface UploadPhotoParams {
  listingId: string;
  photoId: string;
  buffer: Buffer;
  contentType: string;
  extension?: string;
}

/**
 * Uploads a processed photo buffer to Supabase Storage.
 * In `test` environment, uses in-memory storage adapter.
 * In `development` / `production`, requires successful Supabase Storage upload or throws an error.
 */
export async function uploadListingPhotoToStorage(params: UploadPhotoParams): Promise<string> {
  const { listingId, photoId, buffer, contentType, extension = 'webp' } = params;
  const storagePath = `listings/${listingId}/${photoId}.${extension}`;

  if (config.NODE_ENV === 'test') {
    inMemoryStorage.set(storagePath, { buffer, contentType });
    return storagePath;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return storagePath;
}

/**
 * Deletes a photo file from Supabase Storage (and in-memory mock during tests).
 * Surfaces deletion errors in non-test environments.
 */
export async function deleteListingPhotoFromStorage(storagePath: string): Promise<boolean> {
  if (config.NODE_ENV === 'test') {
    inMemoryStorage.delete(storagePath);
    return true;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);

  if (error) {
    throw new Error(`Supabase Storage deletion failed: ${error.message}`);
  }

  return true;
}

/**
 * Generates public or signed URL for a photo's storage path.
 */
export function getPhotoPublicUrl(storagePath: string): string {
  if (config.NODE_ENV === 'test' && inMemoryStorage.has(storagePath)) {
    return `/mock-storage/${storagePath}`;
  }

  if (config.SUPABASE_URL && !config.SUPABASE_URL.includes('example.co')) {
    return `${config.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${storagePath}`;
  }

  return `/mock-storage/${storagePath}`;
}

export function clearInMemoryStorage(): void {
  inMemoryStorage.clear();
}
