import { Request } from 'express';
import { getSupabaseClient } from '../../lib/supabase';
import { config } from '../../config/env';

const BUCKET_NAME = 'listing-photos';
const ORIGINAL_BUCKET_NAME = 'listing-photo-originals';

export function listingPhotoStoragePath(
  listingId: string,
  photoId: string,
  extension = 'webp',
  version?: string
): string {
  return `listings/${listingId}/${photoId}${version ? `.v-${version}` : ''}.${extension}`;
}

// In-memory mock storage map strictly for test environment
const inMemoryStorage = new Map<string, { buffer: Buffer; contentType: string }>();
const inMemoryOriginalStorage = new Map<string, { buffer: Buffer; contentType: string }>();

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
  version?: string;
  options?: StorageOptions;
}

/**
 * Uploads a processed photo buffer to Supabase Storage using authenticated Supabase client context.
 * In `test` environment, uses in-memory storage adapter.
 * In `development` / `production`, requires successful Supabase Storage upload or throws an error.
 */
export async function uploadListingPhotoToStorage(params: UploadPhotoParams): Promise<string> {
  const { listingId, photoId, buffer, contentType, extension = 'webp', version, options } = params;
  const storagePath = listingPhotoStoragePath(listingId, photoId, extension, version);

  if (config.NODE_ENV === 'test') {
    inMemoryStorage.set(storagePath, { buffer, contentType });
    return storagePath;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
    contentType,
    upsert: !version,
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


export function listingPhotoSourceStoragePath(listingId: string, photoId: string): string {
  return `listings/${listingId}/${photoId}.source.webp`;
}

/**
 * Upload an immutable, EXIF-sanitized editing master to the PRIVATE originals bucket.
 * The bucket must be private and owner-scoped Storage RLS policies must be provisioned.
 */
export async function uploadListingPhotoSourceToStorage(
  listingId: string,
  photoId: string,
  buffer: Buffer,
  options?: StorageOptions
): Promise<string> {
  const storagePath = listingPhotoSourceStoragePath(listingId, photoId);
  if (config.NODE_ENV === 'test') {
    if (inMemoryOriginalStorage.has(storagePath)) {
      throw new Error('A private source already exists for this listing photo.');
    }
    inMemoryOriginalStorage.set(storagePath, { buffer: Buffer.from(buffer), contentType: 'image/webp' });
    return storagePath;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { error } = await supabase.storage.from(ORIGINAL_BUCKET_NAME).upload(storagePath, buffer, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw new Error(`Supabase private source upload failed: ${error.message}`);
  return storagePath;
}

/** Download an owner's private editing master using that seller's authenticated JWT. */
export async function downloadListingPhotoSourceFromStorage(
  storagePath: string,
  options?: StorageOptions
): Promise<Buffer> {
  if (config.NODE_ENV === 'test') {
    const stored = inMemoryOriginalStorage.get(storagePath);
    if (!stored) throw new Error('Private listing photo source was not found in test storage.');
    return Buffer.from(stored.buffer);
  }
  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { data, error } = await supabase.storage.from(ORIGINAL_BUCKET_NAME).download(storagePath);
  if (error || !data) throw new Error('Supabase private source download failed.');
  return Buffer.from(await data.arrayBuffer());
}

/** Remove an immutable private editing master after its row is removed or replaced. */
export async function deleteListingPhotoSourceFromStorage(
  storagePath: string,
  options?: StorageOptions
): Promise<boolean> {
  if (config.NODE_ENV === 'test') {
    inMemoryOriginalStorage.delete(storagePath);
    return true;
  }
  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { error } = await supabase.storage.from(ORIGINAL_BUCKET_NAME).remove([storagePath]);
  if (error) throw new Error(`Supabase private source deletion failed: ${error.message}`);
  return true;
}

/** Restore a private source without replacing an existing immutable object. */
export async function restoreListingPhotoSourceToStorage(
  storagePath: string,
  buffer: Buffer,
  options?: StorageOptions
): Promise<void> {
  if (config.NODE_ENV === 'test') {
    if (!inMemoryOriginalStorage.has(storagePath)) {
      inMemoryOriginalStorage.set(storagePath, { buffer: Buffer.from(buffer), contentType: 'image/webp' });
    }
    return;
  }
  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { error } = await supabase.storage.from(ORIGINAL_BUCKET_NAME).upload(storagePath, buffer, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) {
    // A timeout after successful upload may leave the immutable object in place.
    const { data, error: readError } = await supabase.storage.from(ORIGINAL_BUCKET_NAME).download(storagePath);
    if (readError || !data) {
      throw new Error(`Supabase private source restoration failed: ${error.message}`);
    }
  }
}

export function clearInMemoryStorage(): void {
  inMemoryStorage.clear();
  inMemoryOriginalStorage.clear();
}


/** Restore a removed processed listing photo when a permanent delete transaction fails. */
export async function restoreListingPhotoToStorage(
  storagePath: string,
  buffer: Buffer,
  options?: StorageOptions
): Promise<void> {
  const extension = storagePath.split('.').pop()?.toLowerCase();
  const contentType = extension === 'png'
    ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : 'image/webp';

  if (config.NODE_ENV === 'test') {
    inMemoryStorage.set(storagePath, { buffer: Buffer.from(buffer), contentType });
    return;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Supabase Storage restoration failed: ${error.message}`);
  }
}
