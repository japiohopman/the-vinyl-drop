import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { listings } from './listings';

export const orphanedStorageObjects = pgTable('orphaned_storage_objects', {
  id: uuid('id').defaultRandom().primaryKey(),
  listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'cascade' }),
  photoId: uuid('photo_id'),
  storagePath: text('storage_path').notNull(),
  reason: text('reason').notNull(),
  errorDetails: text('error_details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type OrphanedStorageObject = typeof orphanedStorageObjects.$inferSelect;
export type NewOrphanedStorageObject = typeof orphanedStorageObjects.$inferInsert;
