import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { profiles, savedPeople } from '../../db/schema';

export interface SavedPersonProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  savedAt: Date;
}

export interface SavedPersonTarget {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export class SavedPeopleRepository {
  async findProfile(profileId: string): Promise<SavedPersonTarget | null> {
    const db = getDb();
    const rows = await db
      .select({
        id: profiles.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    return rows[0] || null;
  }

  async isSaved(ownerUserId: string, savedUserId: string): Promise<boolean> {
    if (ownerUserId === savedUserId) return false;
    const db = getDb();
    const rows = await db
      .select({ savedUserId: savedPeople.savedUserId })
      .from(savedPeople)
      .where(and(
        eq(savedPeople.ownerUserId, ownerUserId),
        eq(savedPeople.savedUserId, savedUserId)
      ))
      .limit(1);
    return rows.length > 0;
  }

  async save(ownerUserId: string, savedUserId: string): Promise<void> {
    const db = getDb();
    await db
      .insert(savedPeople)
      .values({ ownerUserId, savedUserId })
      .onConflictDoNothing();
  }

  async remove(ownerUserId: string, savedUserId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(savedPeople)
      .where(and(
        eq(savedPeople.ownerUserId, ownerUserId),
        eq(savedPeople.savedUserId, savedUserId)
      ));
  }

  async listForOwner(ownerUserId: string): Promise<SavedPersonProfile[]> {
    const db = getDb();
    return db
      .select({
        id: profiles.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        savedAt: savedPeople.createdAt,
      })
      .from(savedPeople)
      .innerJoin(profiles, eq(savedPeople.savedUserId, profiles.id))
      .where(eq(savedPeople.ownerUserId, ownerUserId))
      .orderBy(asc(savedPeople.createdAt), asc(profiles.username));
  }
}

export const savedPeopleRepository = new SavedPeopleRepository();
