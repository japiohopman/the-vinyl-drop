import { Request } from 'express';
import { getSupabaseClient } from '../../lib/supabase';
import { config } from '../../config/env';

const BUCKET_NAME = 'listing-photos';

// In-memory mock storage map strictly for test environment
const inMemoryStorage = new Map<string, { buffer: Buffer; contentType: string }>();

export interface StorageOptions {
  accessToken?: string;
  req?: Request;
}

export interface UploadPhotoParams {
  listingId: string;
  photoId: string;
  buffer: Buffer;
  contentType: string;
  extension?: string;
  options?: StorageOptions;
}

/**
 * Uploads a processed photo buffer to Supabase Storage using authenticated Supabase client context.
 * In `test` environment, uses in-memory storage adapter.
 * In `development` / `production`, requires successful Supabase Storage upload or throws an error.
 */
export async function uploadListingPhotoToStorage(params: UploadPhotoParams): Promise<string> {
  const { listingId, photoId, buffer, contentType, extension = 'webp', options } = params;
  const storagePath = `listings/${listingId}/${photoId}.${extension}`;

  if (config.NODE_ENV === 'test') {
    inMemoryStorage.set(storagePath, { buffer, contentType });
    return storagePath;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
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
 * Reads an existing listing photo for server-side role validation.
 * The test adapter reads only from its isolated in-memory map.
 */
export async function downloadListingPhotoFromStorage(
  storagePath: string,
  options?: StorageOptions
): Promise<Buffer> {
  if (config.NODE_ENV === 'test') {
    const storedPhoto = inMemoryStorage.get(storagePath);
    if (!storedPhoto) {
      throw new Error('Listing photo was not found in test storage.');
    }
    return Buffer.from(storedPhoto.buffer);
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storagePath);
  if (error || !data) {
    throw new Error('Supabase Storage photo download failed.');
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Deletes a photo file from Supabase Storage (and in-memory mock during tests) using authenticated context.
 * Surfaces deletion errors in non-test environments.
 */
export async function deleteListingPhotoFromStorage(
  storagePath: string,
  options?: StorageOptions
): Promise<boolean> {
  if (config.NODE_ENV === 'test') {
    inMemoryStorage.delete(storagePath);
    return true;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
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
  if (storagePath.startsWith('/') || storagePath.startsWith('assets/')) {
    return storagePath.startsWith('/') ? storagePath : `/${storagePath}`;
  }

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
