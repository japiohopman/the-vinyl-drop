import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { listingStatusEnum } from './enums';
import { physicalCopies } from './physicalCopies';
import { profiles } from './profiles';

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    physicalCopyId: uuid('physical_copy_id')
      .notNull()
      .references(() => physicalCopies.id, { onDelete: 'cascade' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Monetary price stored strictly as integer minor units (e.g. €34.95 -> 3495). Nullable for trade-only offers. */
    price: integer('price'),
    currency: text('currency').default('EUR').notNull(),
    tradeAvailable: boolean('trade_available').default(false).notNull(),
    description: text('description'),
    status: listingStatusEnum('status').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('listings_price_check', sql`"price" IS NULL OR "price" >= 0`),
    index('listings_seller_idx').on(table.sellerId),
    index('listings_physical_copy_idx').on(table.physicalCopyId),
    index('listings_status_idx').on(table.status),
    index('listings_price_idx').on(table.price),
    index('listings_created_at_idx').on(table.createdAt),
    uniqueIndex('listings_active_physical_copy_idx')
      .on(table.physicalCopyId)
      .where(sql`"status" IN ('published', 'reserved')`),
  ]
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
