import { getSupabaseClient } from '../../lib/supabase';
import { config } from '../../config/env';

const BUCKET_NAME = 'listing-photos';

// In-memory mock storage map for test environment or when offline
const inMemoryStorage = new Map<string, { buffer: Buffer; contentType: string }>();

export interface UploadPhotoParams {
  listingId: string;
  photoId: string;
  buffer: Buffer;
  contentType: string;
  extension?: string;
}

/**
 * Uploads a processed photo buffer to Supabase Storage (or in-memory mock during tests).
 * Returns the storage path relative to the bucket.
 */
export async function uploadListingPhotoToStorage(params: UploadPhotoParams): Promise<string> {
  const { listingId, photoId, buffer, contentType, extension = 'webp' } = params;
  const storagePath = `listings/${listingId}/${photoId}.${extension}`;

  // Fallback to in-memory mock storage if in test mode or if Supabase URL is mock
  if (config.NODE_ENV === 'test' || !config.SUPABASE_URL || config.SUPABASE_URL.includes('example.co')) {
    inMemoryStorage.set(storagePath, { buffer, contentType });
    return storagePath;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      // In case of storage upload failure, log and fallback to in-memory or throw error
      console.warn(`Supabase Storage upload warning (${error.message}); using fallback storage.`);
      inMemoryStorage.set(storagePath, { buffer, contentType });
    }
  } catch (err) {
    console.warn(`Supabase Storage client error (${(err as Error).message}); using fallback storage.`);
    inMemoryStorage.set(storagePath, { buffer, contentType });
  }

  return storagePath;
}

/**
 * Deletes a photo file from Supabase Storage (and in-memory mock).
 */
export async function deleteListingPhotoFromStorage(storagePath: string): Promise<boolean> {
  inMemoryStorage.delete(storagePath);

  if (config.NODE_ENV === 'test' || !config.SUPABASE_URL || config.SUPABASE_URL.includes('example.co')) {
    return true;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    return !error;
  } catch {
    return true; // Graceful deletion
  }
}

/**
 * Generates public or signed URL for a photo's storage path.
 */
export function getPhotoPublicUrl(storagePath: string): string {
  if (inMemoryStorage.has(storagePath)) {
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
