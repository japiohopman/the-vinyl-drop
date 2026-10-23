import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { setOverrideDb } from '../src/db';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { listingPhotos } from '../src/db/schema/listingPhotos';
import { comments } from '../src/db/schema/comments';
import { recordListingPublishedEvent, recordCommentCreatedEvent } from '../src/app/services/activityService';
import { createApp } from '../src/app';

async function main() {
  console.log('Starting verification server with in-memory PGlite database...');
  const pglite = new PGlite();
  await pglite.waitReady;

  await pglite.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOLOGIN;
      END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    BEGIN
      RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
    BEGIN
      RETURN COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
    END;
    $$ LANGUAGE plpgsql STABLE;

    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      bucket_id text NOT NULL,
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb
    );

    CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $$
    BEGIN
      RETURN string_to_array(name, '/');
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  const db = drizzle(pglite);

  const migrationFiles = fs
    .readdirSync(path.join(__dirname, '../drizzle'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sqlContent = fs.readFileSync(path.join(__dirname, '../drizzle', file), 'utf8');
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pglite.exec(statement);
    }
  }

  // Seed data
  const sellerId = '11111111-1111-1111-1111-111111111111';
  const buyerId = '22222222-2222-2222-2222-222222222222';

  await db.insert(profiles).values({ id: sellerId, username: 'groove_master', displayName: 'Groove Master' });
  await db.insert(profiles).values({ id: buyerId, username: 'vinyl_digger', displayName: 'Vinyl Digger' });

  const [release] = await db.insert(releases).values({
    title: 'A Love Supreme',
    artist: 'John Coltrane',
    label: 'Impulse!',
    releaseYear: 1965,
    format: 'LP, Album',
  }).returning();

  const [physicalCopy] = await db.insert(physicalCopies).values({
    releaseId: release.id,
    ownerId: sellerId,
    mediaCondition: 'NM',
    sleeveCondition: 'VG+',
  }).returning();

  const [listing] = await db.insert(listings).values({
    physicalCopyId: physicalCopy.id,
    sellerId: sellerId,
    price: 3495,
    currency: 'EUR',
    status: 'published',
  }).returning();

  await db.insert(listingPhotos).values({
    listingId: listing.id,
    storagePath: 'assets/test-cover.webp',
    displayOrder: 0,
    altText: 'Album cover artwork for A Love Supreme by John Coltrane',
  });

  await recordListingPublishedEvent(sellerId, listing.id, db as unknown as ReturnType<typeof import('../src/db').getDb>);

  const [cmt] = await db.insert(comments).values({
    listingId: listing.id,
    authorId: buyerId,
    content: 'Is this the 1965 original mono pressing?',
  }).returning();

  await recordCommentCreatedEvent(buyerId, listing.id, cmt.id, db as unknown as ReturnType<typeof import('../src/db').getDb>);

  setOverrideDb(db);

  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Verification server running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start verification server:', err);
  process.exit(1);
});
