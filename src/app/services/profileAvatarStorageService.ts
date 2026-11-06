import { Request } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../../lib/supabase';
import { config } from '../../config/env';

const BUCKET_NAME = 'profile-avatars';
const inMemoryStorage = new Map<string, { buffer: Buffer; contentType: string }>();

export interface ProfileAvatarStorageOptions {
  req?: Request;
  accessToken?: string;
}

/** Object keys are immutable per upload and scoped to the matching Auth user. */
export function createProfileAvatarStoragePath(userId: string, extension: 'webp' | 'gif'): string {
  return 'profiles/' + userId + '/' + randomUUID() + '.' + extension;
}

function assertOwnerPath(storagePath: string, options?: ProfileAvatarStorageOptions): void {
  const userId = options?.req?.user?.id;
  if (!userId || !storagePath.startsWith('profiles/' + userId + '/')) {
    throw new Error('Profile avatar Storage operation is not authorized for this owner.');
  }
}

export async function uploadProfileAvatarToStorage(
  storagePath: string,
  buffer: Buffer,
  contentType: 'image/webp' | 'image/gif',
  options?: ProfileAvatarStorageOptions
): Promise<void> {
  assertOwnerPath(storagePath, options);
  if (config.NODE_ENV === 'test') {
    inMemoryStorage.set(storagePath, { buffer: Buffer.from(buffer), contentType });
    return;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
    contentType,
    upsert: false,
    cacheControl: '31536000',
  });
  if (error) throw new Error('Profile avatar upload failed: ' + error.message);
}

export async function deleteProfileAvatarFromStorage(
  storagePath: string,
  options?: ProfileAvatarStorageOptions
): Promise<void> {
  assertOwnerPath(storagePath, options);
  if (config.NODE_ENV === 'test') {
    inMemoryStorage.delete(storagePath);
    return;
  }

  const supabase = getSupabaseClient(options?.req, undefined, options?.accessToken);
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
  if (error) throw new Error('Profile avatar deletion failed: ' + error.message);
}

export function getProfileAvatarPublicUrl(storagePath: string): string {
  if (config.NODE_ENV === 'test' && inMemoryStorage.has(storagePath)) {
    return '/mock-storage/profile-avatars/' + storagePath;
  }
  if (config.SUPABASE_URL && !config.SUPABASE_URL.includes('example.co')) {
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    return config.SUPABASE_URL + '/storage/v1/object/public/' + BUCKET_NAME + '/' + encodedPath;
  }
  return '/mock-storage/profile-avatars/' + storagePath;
}

export function clearInMemoryProfileAvatarStorage(): void {
  inMemoryStorage.clear();
}
