import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { listings } from './listings';
import { profiles } from './profiles';

export type ConversationType = 'listing' | 'direct';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationType: text('conversation_type').$type<ConversationType>().notNull(),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'no action' }),
    participantAId: uuid('participant_a_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'no action' }),
    participantBId: uuid('participant_b_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'no action' }),
    participantAReadSeq: bigint('participant_a_read_seq', { mode: 'number' }).notNull().default(0),
    participantBReadSeq: bigint('participant_b_read_seq', { mode: 'number' }).notNull().default(0),
    participantAArchivedAt: timestamp('participant_a_archived_at', { withTimezone: true }),
    participantBArchivedAt: timestamp('participant_b_archived_at', { withTimezone: true }),
    lastMessageSeq: bigint('last_message_seq', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conversations_listing_participant_a_idx')
      .on(table.listingId, table.participantAId)
      .where(sql`${table.conversationType} = 'listing'`),
    uniqueIndex('conversations_direct_pair_unique_idx')
      .on(table.participantAId, table.participantBId)
      .where(sql`${table.conversationType} = 'direct'`),
    index('conversations_listing_idx').on(table.listingId),
    index('conversations_participant_a_idx').on(table.participantAId),
    index('conversations_participant_b_idx').on(table.participantBId),
    index('conversations_updated_at_idx').on(table.updatedAt),
    check(
      'conversations_type_shape_check',
      sql`(${table.conversationType} = 'listing' AND ${table.listingId} IS NOT NULL) OR (${table.conversationType} = 'direct' AND ${table.listingId} IS NULL)`
    ),
    check('conversations_distinct_participants_check', sql`${table.participantAId} <> ${table.participantBId}`),
    check(
      'conversations_direct_pair_order_check',
      sql`${table.conversationType} <> 'direct' OR ${table.participantAId} < ${table.participantBId}`
    ),
    check('conversations_read_seq_nonnegative_check', sql`${table.participantAReadSeq} >= 0 AND ${table.participantBReadSeq} >= 0 AND ${table.lastMessageSeq} >= 0`),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
