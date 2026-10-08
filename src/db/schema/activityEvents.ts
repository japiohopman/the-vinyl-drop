import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { comments } from './comments';
import { listings } from './listings';
import { profiles } from './profiles';

export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('activity_events_actor_idx').on(table.actorId),
    index('activity_events_listing_idx').on(table.listingId),
    index('activity_events_type_idx').on(table.eventType),
    index('activity_events_created_at_idx').on(table.createdAt),
  ]
);

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
