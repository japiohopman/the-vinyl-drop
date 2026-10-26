import { check, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/**
 * Owner-private saved profile relationship. This table has no client Data API grants;
 * all reads and mutations flow through authenticated server-side services.
 */
export const savedPeople = pgTable(
  'saved_people',
  {
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    savedUserId: uuid('saved_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('saved_people_owner_saved_unique_idx').on(table.ownerUserId, table.savedUserId),
    index('saved_people_owner_created_idx').on(table.ownerUserId, table.createdAt),
    check('saved_people_no_self_check', sql`${table.ownerUserId} <> ${table.savedUserId}`),
  ]
);

export type SavedPerson = typeof savedPeople.$inferSelect;
export type NewSavedPerson = typeof savedPeople.$inferInsert;
