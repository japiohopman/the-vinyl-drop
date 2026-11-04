import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { ListingPhotoRole } from '../../domain/listingPhotoRole';
import { listings } from './listings';
import { ListingPhotoEditorState } from '../../domain/listingPhotoEditor';

export const listingPhotos = pgTable(
  'listing_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    storagePath: text('storage_path').notNull(),
    sourceStoragePath: text('source_storage_path'),
    sourceIsLegacy: boolean('source_is_legacy').notNull().default(true),
    editorState: jsonb('editor_state').$type<ListingPhotoEditorState>(),
    displayOrder: integer('display_order').default(0).notNull(),
    altText: text('alt_text'),
    role: text('role').$type<ListingPhotoRole>().default('legacy_unclassified').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('listing_photos_role_check', sql`\"role\" IN ('front_cover', 'back_cover', 'inside_sleeve', 'insert_poster', 'record', 'detail', 'other', 'legacy_unclassified')`),
    index('listing_photos_listing_idx').on(table.listingId),
    index('listing_photos_order_idx').on(table.listingId, table.displayOrder),
    uniqueIndex('listing_photos_front_cover_unique_idx').on(table.listingId).where(sql`\"role\" = 'front_cover'`),
    uniqueIndex('listing_photos_back_cover_unique_idx').on(table.listingId).where(sql`\"role\" = 'back_cover'`),
  ]
);

export type ListingPhoto = typeof listingPhotos.$inferSelect;
export type NewListingPhoto = typeof listingPhotos.$inferInsert;
