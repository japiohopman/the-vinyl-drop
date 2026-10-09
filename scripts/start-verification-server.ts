import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { setOverrideDb } from '../src/db';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { comments } from '../src/db/schema/comments';
import { recordListingPublishedEvent, recordCommentCreatedEvent } from '../src/app/services/activityService';
import { createApp } from '../src/app';

async function main() {
  console.log('Starting verification server with in-memory PGlite database...');
  const pglite = new PGlite();
  await pglite.waitReady;
  const db = drizzle(pglite);

  const migrationFiles = [
    '0000_grey_living_tribunal.sql',
    '0001_add_physical_copies.sql',
    '0002_add_release_cover_art.sql',
    '0003_brainy_scarlet_witch.sql',
    '0004_mighty_spacker_dave.sql',
  ];

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

  await db.insert(profiles).values([
    { id: sellerId, username: 'groove_master', displayName: 'Groove Master', email: 'groove@example.com' },
    { id: buyerId, username: 'vinyl_digger', displayName: 'Vinyl Digger', email: 'digger@example.com' },
  ]);

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
