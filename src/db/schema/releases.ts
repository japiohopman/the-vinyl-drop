import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
    countryCode: text('country_code'),
    format: text('format'),
    formatCharacteristics: text('format_characteristics').array().notNull().default(sql`'{}'::text[]`),
    barcode: text('barcode'),
    genre: text('genre'),
    canonicalGenres: text('canonical_genres').array().notNull().default(sql`'{}'::text[]`),
    coverArtUrl: text('cover_art_url'),
    youtubeVideoId: text('youtube_video_id'),
    externalSource: text('external_source'),
    externalId: text('external_id'),
    lastImportedAt: timestamp('last_imported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('releases_youtube_video_id_check', sql`${table.youtubeVideoId} IS NULL OR ${table.youtubeVideoId} ~ '^[A-Za-z0-9_-]{11}$'`),
    check('releases_country_code_check', sql`${table.countryCode} IS NULL OR ${table.countryCode} ~ '^[A-Z]{2}$'`),
    index('releases_country_code_idx').on(table.countryCode),
    index('releases_canonical_genres_idx').using('gin', table.canonicalGenres),
    index('releases_format_characteristics_idx').using('gin', table.formatCharacteristics),
    index('releases_artist_idx').on(table.artist),
    index('releases_title_idx').on(table.title),
    index('releases_label_idx').on(table.label),
    index('releases_cat_num_idx').on(table.catalogueNumber),
    index('releases_year_idx').on(table.releaseYear),
    index('releases_artist_trgm_idx').using('gin', sql`${table.artist} extensions.gin_trgm_ops`),
    index('releases_title_trgm_idx').using('gin', sql`${table.title} extensions.gin_trgm_ops`),
    index('releases_label_trgm_idx').using('gin', sql`${table.label} extensions.gin_trgm_ops`),
  ]
);
export type Release = typeof releases.$inferSelect;
export type NewRelease = typeof releases.$inferInsert;
