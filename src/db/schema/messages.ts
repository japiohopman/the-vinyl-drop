import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './conversations';
import { profiles } from './profiles';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'no action' }),
    messageSeq: bigint('message_seq', { mode: 'number' }).notNull().default(0),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'no action' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('messages_conversation_seq_idx').on(table.conversationId, table.messageSeq),
    index('messages_conversation_created_id_idx').on(table.conversationId, table.createdAt, table.id),
    index('messages_sender_idx').on(table.senderId),
  ]
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
