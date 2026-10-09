import { getDb } from '../src/db';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { listingPhotos } from '../src/db/schema/listingPhotos';
import { comments } from '../src/db/schema/comments';
import { recordListingPublishedEvent, recordCommentCreatedEvent } from '../src/app/services/activityService';
import { config } from '../src/config/env';
import { eq } from 'drizzle-orm';

/**
 * Seed script for Staging/Beta Environment.
 * Populates an isolated Supabase/PostgreSQL staging database with
 * deterministic test accounts, canonical releases, physical copies,
 * published listings, photos, and comment threads.
 */
async function seedStaging() {
  console.log('=== The Vinyl Drop — Staging Seed Script ===');

  const force = process.argv.includes('--force');

  if (config.NODE_ENV === 'production' && !force) {
    console.error('ERROR: Refusing to run seed script in production without --force flag.');
    process.exit(1);
  }

  const db = getDb();

  // Mask database URL for safety log
  const maskedDbUrl = config.DATABASE_URL
    ? config.DATABASE_URL.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')
    : 'unconfigured';
  console.log(`Connecting to database: ${maskedDbUrl}`);

  // Test accounts definitions (matching Supabase Auth user IDs in staging)
  const sellerId = '11111111-1111-4111-8111-111111111111';
  const buyerId = '22222222-2222-4222-8222-222222222222';
  const collectorId = '33333333-3333-4333-8333-333333333333';

  console.log('Seeding staging test profiles...');
  const testProfiles = [
    {
      id: sellerId,
      username: 'amsterdam_grooves',
      displayName: 'Amsterdam Grooves',
      email: 'seller.beta@vinyldrop.local',
      bio: 'Crate digger & physical vinyl collector based in De Pijp, Amsterdam.',
      location: 'Amsterdam, NL',
      websiteUrl: 'https://vinyldrop.local/profiles/amsterdam_grooves',
    },
    {
      id: buyerId,
      username: 'spin_doctor',
      displayName: 'Spin Doctor',
      email: 'buyer.beta@vinyldrop.local',
      bio: 'Jazz & Electronic record enthusiast looking for clean original pressings.',
      location: 'Amsterdam Noord, NL',
      websiteUrl: null,
    },
    {
      id: collectorId,
      username: 'wax_collector',
      displayName: 'Wax Collector',
      email: 'collector.beta@vinyldrop.local',
      bio: 'Rare soul, funk, and afrobeat vinyl curator.',
      location: 'Oost, Amsterdam',
      websiteUrl: null,
    },
  ];

  for (const profile of testProfiles) {
    const existing = await db.select().from(profiles).where(eq(profiles.id, profile.id));
    if (existing.length === 0) {
      await db.insert(profiles).values(profile);
      console.log(`  + Created profile: @${profile.username}`);
    } else {
      console.log(`  . Profile @${profile.username} already exists`);
    }
  }

  console.log('Seeding canonical catalog releases...');
  const testReleases = [
    {
      title: 'Kind of Blue',
      artist: 'Miles Davis',
      label: 'Columbia',
      catalogNumber: 'CS 8163',
      releaseYear: 1959,
      format: 'LP, Album, Reissue',
      genre: 'Jazz',
      coverArtUrl: 'https://images.vinyldrop.local/kind-of-blue.jpg',
    },
    {
      title: 'Rumours',
      artist: 'Fleetwood Mac',
      label: 'Warner Bros. Records',
      catalogNumber: 'BSK 3010',
      releaseYear: 1977,
      format: 'LP, Album',
      genre: 'Rock',
      coverArtUrl: 'https://images.vinyldrop.local/rumours.jpg',
    },
    {
      title: 'Random Access Memories',
      artist: 'Daft Punk',
      label: 'Columbia',
      catalogNumber: '88883743781',
      releaseYear: 2013,
      format: '2xLP, Album',
      genre: 'Electronic',
      coverArtUrl: 'https://images.vinyldrop.local/ram.jpg',
    },
    {
      title: 'Back to Black',
      artist: 'Amy Winehouse',
      label: 'Island Records',
      catalogNumber: '1713041',
      releaseYear: 2006,
      format: 'LP, Album',
      genre: 'Funk / Soul',
      coverArtUrl: 'https://images.vinyldrop.local/back-to-black.jpg',
    },
    {
      title: 'A Love Supreme',
      artist: 'John Coltrane',
      label: 'Impulse!',
      catalogNumber: 'AS-77',
      releaseYear: 1965,
      format: 'LP, Album',
      genre: 'Jazz',
      coverArtUrl: 'https://images.vinyldrop.local/a-love-supreme.jpg',
    },
  ];

  const createdReleases = [];
  for (const relData of testReleases) {
    const existing = await db
      .select()
      .from(releases)
      .where(eq(releases.catalogNumber, relData.catalogNumber));
    if (existing.length > 0) {
      createdReleases.push(existing[0]);
      console.log(`  . Release ${relData.artist} - ${relData.title} already exists`);
    } else {
      const [inserted] = await db.insert(releases).values(relData).returning();
      createdReleases.push(inserted);
      console.log(`  + Created release: ${inserted.artist} - ${inserted.title}`);
    }
  }

  console.log('Seeding physical copies & marketplace listings...');
  const seedListingsData = [
    {
      releaseIndex: 0, // Kind of Blue
      ownerId: sellerId,
      mediaCondition: 'NM' as const,
      sleeveCondition: 'VG+' as const,
      notes: 'Crisp audio, slight corner wear on outer sleeve.',
      price: 3850, // €38.50
      description: 'Classic modal jazz landmark. Clean pressing, play-tested on Technics SL-1200.',
      photoKey: 'staging/kind-of-blue.webp',
      commentContent: 'Is this pressing Japanese or US reissue?',
      commentAuthorId: buyerId,
    },
    {
      releaseIndex: 1, // Rumours
      ownerId: sellerId,
      mediaCondition: 'VG+' as const,
      sleeveCondition: 'VG+' as const,
      notes: 'Includes original lyric insert.',
      price: 2800, // €28.00
      description: 'Original 1977 US pressing with textured jacket and insert. Plays great.',
      photoKey: 'staging/rumours.webp',
      commentContent: 'Are there any audible pops on Side 2?',
      commentAuthorId: collectorId,
    },
    {
      releaseIndex: 2, // RAM
      ownerId: sellerId,
      mediaCondition: 'M' as const,
      sleeveCondition: 'NM' as const,
      notes: 'Sealed inside original poly sleeve.',
      price: 4500, // €45.00
      description: 'Gatefold 180g double LP. Flawless copy.',
      photoKey: 'staging/ram.webp',
      commentContent: 'Can meet up at Central Station for pickup.',
      commentAuthorId: buyerId,
    },
    {
      releaseIndex: 3, // Back to Black
      ownerId: collectorId,
      mediaCondition: 'VG+' as const,
      sleeveCondition: 'VG' as const,
      notes: 'Minor seam split on top jacket.',
      price: null, // Trade only
      description: 'Looking to trade for Blue Note or Impulse! jazz titles in VG+ or better.',
      photoKey: 'staging/back-to-black.webp',
      commentContent: 'Would you be interested in a Coltrane trade?',
      commentAuthorId: sellerId,
    },
  ];

  for (const item of seedListingsData) {
    const release = createdReleases[item.releaseIndex];

    // Create Physical Copy
    const [physicalCopy] = await db
      .insert(physicalCopies)
      .values({
        releaseId: release.id,
        ownerId: item.ownerId,
        mediaCondition: item.mediaCondition,
        sleeveCondition: item.sleeveCondition,
        notes: item.notes,
      })
      .returning();

    // Create Listing
    const [listing] = await db
      .insert(listings)
      .values({
        physicalCopyId: physicalCopy.id,
        sellerId: item.ownerId,
        price: item.price,
        currency: 'EUR',
        description: item.description,
        status: 'published',
      })
      .returning();

    // Add Photo Reference
    await db.insert(listingPhotos).values({
      listingId: listing.id,
      storagePath: item.photoKey,
      publicUrl: `/storage/${item.photoKey}`,
      displayOrder: 0,
      altText: `Vinyl cover photo for ${release.artist} - ${release.title}`,
    });

    // Record Activity
    await recordListingPublishedEvent(item.ownerId, listing.id, db);

    // Create Comment
    const [cmt] = await db
      .insert(comments)
      .values({
        listingId: listing.id,
        authorId: item.commentAuthorId,
        content: item.commentContent,
      })
      .returning();

    await recordCommentCreatedEvent(item.commentAuthorId, listing.id, cmt.id, db);

    console.log(`  + Seeded listing #${listing.id}: ${release.artist} - ${release.title}`);
  }

  console.log('\n=== Staging Seed Completed Successfully! ===');
  console.log('Pre-seeded staging test accounts:');
  console.log('  1. Seller:    seller.beta@vinyldrop.local (@amsterdam_grooves)');
  console.log('  2. Buyer:     buyer.beta@vinyldrop.local (@spin_doctor)');
  console.log('  3. Collector: collector.beta@vinyldrop.local (@wax_collector)');
}

seedStaging()
  .catch((err) => {
    console.error('Failed to seed staging database:', err);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
