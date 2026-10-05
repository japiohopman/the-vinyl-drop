import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conditionGradeEnum } from './enums';
import { profiles } from './profiles';
import { releases } from './releases';

export const physicalCopies = pgTable(
  'physical_copies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    mediaCondition: conditionGradeEnum('media_condition').notNull(),
    sleeveCondition: conditionGradeEnum('sleeve_condition').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('physical_copies_release_idx').on(table.releaseId),
    index('physical_copies_owner_idx').on(table.ownerId),
  ]
);

export type PhysicalCopy = typeof physicalCopies.$inferSelect;
export type NewPhysicalCopy = typeof physicalCopies.$inferInsert;
