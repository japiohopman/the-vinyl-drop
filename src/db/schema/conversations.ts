import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { listings } from './listings';
import { profiles } from './profiles';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'no action' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'no action' }),
    buyerReadAt: timestamp('buyer_read_at', { withTimezone: true }),
    sellerReadAt: timestamp('seller_read_at', { withTimezone: true }),
    buyerArchivedAt: timestamp('buyer_archived_at', { withTimezone: true }),
    sellerArchivedAt: timestamp('seller_archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conversations_listing_buyer_idx').on(table.listingId, table.buyerId),
    index('conversations_listing_idx').on(table.listingId),
    index('conversations_buyer_idx').on(table.buyerId),
    index('conversations_updated_at_idx').on(table.updatedAt),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
