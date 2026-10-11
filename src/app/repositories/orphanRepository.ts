import { getDb } from '../../db';
import { orphanedStorageObjects, NewOrphanedStorageObject, OrphanedStorageObject } from '../../db/schema/orphanedStorageObjects';

type DbInstance = ReturnType<typeof getDb>;

export async function recordOrphanedStorageObject(
  data: NewOrphanedStorageObject,
  dbOverride?: DbInstance
): Promise<OrphanedStorageObject> {
  const db = dbOverride || getDb();
  const [record] = await db
    .insert(orphanedStorageObjects)
    .values(data)
    .returning();
  return record;
}
