import { findProfileById, findProfileByUsername, updateProfile as updateProfileInRepo } from '../repositories/profileRepository';
import { Profile } from '../../db/schema/profiles';
import { ProfileUpdateInput } from '../../validators/profile';
import { getDb } from '../../db';

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

export async function getProfileByUsername(username: string, dbOverride?: DbInstance): Promise<Profile | null> {
  return findProfileByUsername(username, dbOverride);
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
  if (input.username && input.username !== existingProfile.username) {
    const usernameOccupant = await findProfileByUsername(input.username, dbOverride);
    if (usernameOccupant && usernameOccupant.id !== targetUserId) {
      throw new ValidationError('Username is already taken');
    }
  }

  const updated = await updateProfileInRepo(
    targetUserId,
    {
      username: input.username,
      displayName: input.displayName || null,
      bio: input.bio || null,
      location: input.location || null,
      avatarUrl: input.avatarUrl || null,
      websiteUrl: input.websiteUrl || null,
    },
    dbOverride
  );

  if (!updated) {
    throw new Error('Failed to update profile');
  }

  return updated;
}
