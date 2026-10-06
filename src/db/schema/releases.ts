import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const releases = pgTable(
  'releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artist: text('artist').notNull(),
    title: text('title').notNull(),
    label: text('label'),
    catalogueNumber: text('catalogue_number'),
    releaseYear: integer('release_year'),
    country: text('country'),
    format: text('format'),
    barcode: text('barcode'),
    genre: text('genre'),
    coverArtUrl: text('cover_art_url'),
    externalSource: text('external_source'),
    externalId: text('external_id'),
    lastImportedAt: timestamp('last_imported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('releases_artist_idx').on(table.artist),
    index('releases_title_idx').on(table.title),
    index('releases_label_idx').on(table.label),
    index('releases_cat_num_idx').on(table.catalogueNumber),
    index('releases_year_idx').on(table.releaseYear),
  ]
);

export type Release = typeof releases.$inferSelect;
export type NewRelease = typeof releases.$inferInsert;
