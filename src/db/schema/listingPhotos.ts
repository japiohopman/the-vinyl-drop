import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { listings } from './listings';

export const listingPhotos = pgTable(
  'listing_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    storagePath: text('storage_path').notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    altText: text('alt_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('listing_photos_listing_idx').on(table.listingId),
    index('listing_photos_order_idx').on(table.listingId, table.displayOrder),
  ]
);

export type ListingPhoto = typeof listingPhotos.$inferSelect;
export type NewListingPhoto = typeof listingPhotos.$inferInsert;
