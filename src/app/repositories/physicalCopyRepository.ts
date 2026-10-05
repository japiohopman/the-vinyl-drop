import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { NewPhysicalCopy, PhysicalCopy, physicalCopies } from '../../db/schema/physicalCopies';

type DbInstance = ReturnType<typeof getDb>;

export async function findPhysicalCopyById(id: string, dbOverride?: DbInstance): Promise<PhysicalCopy | null> {
  const db = dbOverride || getDb();
  const results = await db.select().from(physicalCopies).where(eq(physicalCopies.id, id)).limit(1);
  return results[0] || null;
}

export async function findPhysicalCopiesByOwnerId(ownerId: string, dbOverride?: DbInstance): Promise<PhysicalCopy[]> {
  const db = dbOverride || getDb();
  return db.select().from(physicalCopies).where(eq(physicalCopies.ownerId, ownerId));
}

export async function createPhysicalCopy(data: NewPhysicalCopy, dbOverride?: DbInstance): Promise<PhysicalCopy> {
  const db = dbOverride || getDb();
  const results = await db.insert(physicalCopies).values(data).returning();
  return results[0];
}

export async function updatePhysicalCopy(
  id: string,
  data: Partial<NewPhysicalCopy>,
  dbOverride?: DbInstance
): Promise<PhysicalCopy | null> {
  const db = dbOverride || getDb();
  const results = await db
    .update(physicalCopies)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(physicalCopies.id, id))
    .returning();
  return results[0] || null;
}

export async function deletePhysicalCopy(id: string, dbOverride?: DbInstance): Promise<boolean> {
  const db = dbOverride || getDb();
  const results = await db.delete(physicalCopies).where(eq(physicalCopies.id, id)).returning();
  return results.length > 0;
}
