import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conditionGradeEnum, listingStatusEnum } from './enums';
import { profiles } from './profiles';
import { releases } from './releases';

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Monetary price stored strictly as integer minor units (e.g. €34.95 -> 3495). Nullable for trade-only offers. */
    price: integer('price'),
    currency: text('currency').default('EUR').notNull(),
    mediaCondition: conditionGradeEnum('media_condition').notNull(),
    sleeveCondition: conditionGradeEnum('sleeve_condition').notNull(),
    tradeAvailable: boolean('trade_available').default(false).notNull(),
    description: text('description'),
    status: listingStatusEnum('status').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('listings_seller_idx').on(table.sellerId),
    index('listings_release_idx').on(table.releaseId),
    index('listings_status_idx').on(table.status),
    index('listings_price_idx').on(table.price),
    index('listings_created_at_idx').on(table.createdAt),
  ]
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
