import {
  findProfileById,
  findProfileByUsername,
  findPublicProfileByUsername,
  updateProfile as updateProfileInRepo,
} from '../repositories/profileRepository';
import { Profile } from '../../db/schema/profiles';
import { ProfileUpdateInput } from '../../validators/profile';
import { getDb } from '../../db';
import { getProfileAvatarPublicUrl } from './profileAvatarStorageService';

type DbInstance = ReturnType<typeof getDb>;

export class AuthorizationError extends Error {
  constructor(message = 'Forbidden: You do not have permission to perform this action') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Public profile presentation shape passed to EJS view templates.
 * Raw avatarStoragePath and unrelated internal columns are omitted.
 */
export interface PublicProfileViewModel {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarPublicUrl: string | null;
  websiteUrl: string | null;
  soundcloudUrl: string | null;
  mixcloudUrl: string | null;
  bio: string | null;
  location: string | null;
  createdAt: Date;
}

export async function getProfileByUsername(username: string, dbOverride?: DbInstance): Promise<Profile | null> {
  return findProfileByUsername(username, dbOverride);
}

/**
 * Dedicated public profile read operation for public profile and Crate landing pages.
 * Resolves the public avatar URL server-side and excludes raw storage path from the view model.
 */
export async function getPublicProfileByUsername(
  username: string,
  dbOverride?: DbInstance
): Promise<PublicProfileViewModel | null> {
  const record = await findPublicProfileByUsername(username, dbOverride);
  if (!record) return null;

  const avatarPublicUrl = record.avatarStoragePath
    ? getProfileAvatarPublicUrl(record.avatarStoragePath)
    : (record.avatarUrl || null);

  return {
    id: record.id,
    username: record.username,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    avatarPublicUrl,
    websiteUrl: record.websiteUrl,
    soundcloudUrl: record.soundcloudUrl,
    mixcloudUrl: record.mixcloudUrl,
    bio: record.bio,
    location: record.location,
    createdAt: record.createdAt,
  };
}

export async function getProfileById(id: string, dbOverride?: DbInstance): Promise<Profile | null> {
  return findProfileById(id, dbOverride);
}

export async function updateProfile(
  targetUserId: string,
  requestingUserId: string,
  input: ProfileUpdateInput,
  dbOverride?: DbInstance
): Promise<Profile> {
  // Server-side ownership verification
  if (targetUserId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this profile');
  }

  const existingProfile = await findProfileById(targetUserId, dbOverride);
  if (!existingProfile) {
    throw new ValidationError('Profile not found');
  }

  // If username is changing, verify it is not already taken by another user
  if (input.username && input.username.toLowerCase() !== existingProfile.username.toLowerCase()) {
    const usernameOccupant = await findProfileByUsername(input.username, dbOverride);
    if (usernameOccupant && usernameOccupant.id !== targetUserId) {
      throw new ValidationError('Username is already taken');
    }
  }

  const normalizedWebsiteUrl = input.websiteUrl && input.websiteUrl.trim() !== '' ? input.websiteUrl.trim() : null;

  const updated = await updateProfileInRepo(
    targetUserId,
    {
      username: input.username,
      displayName: input.displayName || null,
      bio: input.bio || null,
      location: input.location || null,
      avatarUrl: input.avatarUrl || null,
      websiteUrl: normalizedWebsiteUrl,
      soundcloudUrl: input.soundcloudUrl && input.soundcloudUrl.trim() ? input.soundcloudUrl.trim() : null,
      mixcloudUrl: input.mixcloudUrl && input.mixcloudUrl.trim() ? input.mixcloudUrl.trim() : null,
    },
    dbOverride
  );

  if (!updated) {
    throw new Error('Failed to update profile');
  }

  return updated;
}


/**
 * Changes the uploaded-avatar pointer only for the authenticated profile owner.
 * The caller uploads the new immutable Storage object first and removes the
 * previous object only after this database update succeeds.
 */
export async function setProfileAvatarStoragePath(
  targetUserId: string,
  requestingUserId: string,
  storagePath: string | null,
  dbOverride?: DbInstance
): Promise<{ profile: Profile; previousStoragePath: string | null }> {
  if (targetUserId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this profile avatar');
  }

  const existingProfile = await findProfileById(targetUserId, dbOverride);
  if (!existingProfile) throw new ValidationError('Profile not found');

  const updated = await updateProfileInRepo(
    targetUserId,
    { avatarStoragePath: storagePath },
    dbOverride
  );
  if (!updated) throw new Error('Failed to update profile avatar');

  return {
    profile: updated,
    previousStoragePath: existingProfile.avatarStoragePath ?? null,
  };
}
