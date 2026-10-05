import { eq } from 'drizzle-orm';
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
  const results = await database.select().from(profiles).where(eq(profiles.username, username)).limit(1);
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
