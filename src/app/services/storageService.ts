import crypto from 'crypto';
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
 * Keep mutable public object paths short-lived in browsers, while allowing
 * versioned derivative paths to be reused for one day. Replacements use a new
 * versioned path, so a browser never confuses a prior image with the new image.
 */
export function getListingPhotoCacheControl(storagePath: string): string {
  return /\.v-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:webp|png|jpe?g)$/i.test(storagePath)
    ? '86400'
    : '3600';
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
    cacheControl: getListingPhotoCacheControl(storagePath),
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


/**
 * Creates a fresh immutable URL for a restored photo when its old URL already
 * contains different bytes. Existing version identifiers are replaced rather
 * than nested, and the recognized image extension is retained.
 */
function createDistinctRestorationPath(storagePath: string): string {
  const match = storagePath.match(
    /^(.*?)(?:\.v-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?(\.(?:webp|png|jpe?g))$/i
  );
  if (!match) {
    throw new Error('Cannot create a versioned URL for this listing photo path.');
  }
  return `${match[1]}.v-${crypto.randomUUID()}${match[2]}`;
}

/**
 * Restores an object without overwriting bytes at an existing public URL.
 * A failed upload is checked by reading back the target, covering timeouts
 * after a successful Storage write without making the path mutable.
 */
async function uploadRestoredPhotoWithoutOverwrite(
  supabase: ReturnType<typeof getSupabaseClient>,
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<'restored' | 'different'> {
  const bucket = supabase.storage.from(BUCKET_NAME);
  const { error } = await bucket.upload(storagePath, buffer, {
    contentType,
    cacheControl: getListingPhotoCacheControl(storagePath),
    upsert: false,
  });
  if (!error) return 'restored';

  const { data, error: readError } = await bucket.download(storagePath);
  if (readError || !data) {
    throw new Error(`Supabase Storage restoration failed: ${error.message}`);
  }

  const existingBuffer = Buffer.from(await data.arrayBuffer());
  return existingBuffer.equals(buffer) ? 'restored' : 'different';
}

/**
 * Restore a removed processed listing photo without mutating an immutable URL.
 * Identical bytes retain the original URL; different bytes receive a fresh
 * UUID-versioned URL so browsers and the CDN cannot serve a stale cached image.
 *
 * @returns The URL path that now contains the restored bytes.
 */
export async function restoreListingPhotoToStorage(
  storagePath: string,
  buffer: Buffer,
  options?: StorageOptions
): Promise<string> {
  const extension = storagePath.split('.').pop()?.toLowerCase();
  const contentType = extension === 'png'
    ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : 'image/webp';

  if (config.NODE_ENV === 'test') {
    const existing = inMemoryStorage.get(storagePath);
    if (existing?.buffer.equals(buffer)) return storagePath;

    const restoredPath = existing
      ? createDistinctRestorationPath(storagePath)
      : storagePath;
    inMemoryStorage.set(restoredPath, { buffer: Buffer.from(buffer), contentType });
    return restoredPath;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const bucket = supabase.storage.from(BUCKET_NAME);
  const { data, error } = await bucket.download(storagePath);

  if (!error && data) {
    const existingBuffer = Buffer.from(await data.arrayBuffer());
    if (existingBuffer.equals(buffer)) return storagePath;
  }

  // Uploads use upsert:false, so a missing-object read racing with another
  // restore cannot overwrite that concurrent writer's bytes.
  const originalPathResult = await uploadRestoredPhotoWithoutOverwrite(
    supabase,
    storagePath,
    buffer,
    contentType
  );
  if (originalPathResult === 'restored') return storagePath;

  // The original URL already contains different bytes. Preserve it and store
  // the snapshot under a new immutable URL instead.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const restoredPath = createDistinctRestorationPath(storagePath);
    const result = await uploadRestoredPhotoWithoutOverwrite(
      supabase,
      restoredPath,
      buffer,
      contentType
    );
    if (result === 'restored') return restoredPath;
  }

  throw new Error('Supabase Storage could not allocate a distinct restoration URL.');
}
