import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { profiles, Profile, NewProfile } from '../../db/schema/profiles';

type DbInstance = ReturnType<typeof getDb>;

export async function findProfileById(id: string, dbOverride?: DbInstance): Promise<Profile | null> {
  const database = dbOverride || getDb();
  const results = await database.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return results[0] || null;
}

export async function findProfileByUsername(username: string, dbOverride?: DbInstance): Promise<Profile | null> {
  const database = dbOverride || getDb();
  const results = await database
    .select()
    .from(profiles)
    .where(eq(sql`LOWER(${profiles.username})`, username.toLowerCase()))
    .limit(1);
  return results[0] || null;
}

/** Narrow projection selecting only fields needed to render public profile and crate views. */
export type PublicProfileRecord = Pick<
  Profile,
  | 'id'
  | 'username'
  | 'displayName'
  | 'avatarUrl'
  | 'avatarStoragePath'
  | 'websiteUrl'
  | 'soundcloudUrl'
  | 'mixcloudUrl'
  | 'bio'
  | 'location'
  | 'createdAt'
>;

/**
 * Dedicated public profile read selecting only display-necessary columns.
 * Preserves broad select() for authenticated profile-edit / auth flows.
 */
export async function findPublicProfileByUsername(
  username: string,
  dbOverride?: DbInstance
): Promise<PublicProfileRecord | null> {
  const database = dbOverride || getDb();
  const results = await database
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      avatarStoragePath: profiles.avatarStoragePath,
      websiteUrl: profiles.websiteUrl,
      soundcloudUrl: profiles.soundcloudUrl,
      mixcloudUrl: profiles.mixcloudUrl,
      bio: profiles.bio,
      location: profiles.location,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(sql`LOWER(${profiles.username})`, username.toLowerCase()))
    .limit(1);
  return results[0] || null;
}

export async function createProfile(data: NewProfile, dbOverride?: DbInstance): Promise<Profile> {
  const database = dbOverride || getDb();
  const results = await database.insert(profiles).values(data).returning();
  return results[0];
}

export async function updateProfile(
  id: string,
  data: Partial<Omit<NewProfile, 'id'>>,
  dbOverride?: DbInstance
): Promise<Profile | null> {
  const database = dbOverride || getDb();
  const results = await database
    .update(profiles)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, id))
    .returning();
  return results[0] || null;
}
