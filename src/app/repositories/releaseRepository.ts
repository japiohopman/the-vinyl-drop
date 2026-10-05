import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { NewRelease, Release, releases } from '../../db/schema/releases';

type DbInstance = ReturnType<typeof getDb>;

export async function findReleaseById(id: string, dbOverride?: DbInstance): Promise<Release | null> {
  const db = dbOverride || getDb();
  const results = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  return results[0] || null;
}

export async function createRelease(data: NewRelease, dbOverride?: DbInstance): Promise<Release> {
  const db = dbOverride || getDb();
  const results = await db.insert(releases).values(data).returning();
  return results[0];
}

export async function listReleases(limit = 50, dbOverride?: DbInstance): Promise<Release[]> {
  const db = dbOverride || getDb();
  return db.select().from(releases).limit(limit);
}
