import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDb } from '../src/db';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { comments } from '../src/db/schema/comments';
import { activityEvents } from '../src/db/schema/activityEvents';
import { config } from '../src/config/env';
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';

export interface SeedStagingOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbOverride?: any;
  dbUrlOverride?: string;
  envOverride?: Record<string, string>;
  accountIds?: {
    sellerId?: string;
    buyerId?: string;
    collectorId?: string;
  };
}

/**
 * Helper to parse the hostname portion from a PostgreSQL connection URL.
 * Throws an error for malformed or unparseable URL inputs.
 */
export function extractDbHostname(dbUrl: string): string {
  if (!dbUrl || dbUrl.trim() === '') return '';
  const match = dbUrl.trim().match(/^([a-z0-9+-.]+):\/\//i);
  if (!match) {
    throw new Error(`CRITICAL SAFETY ERROR: Missing protocol scheme in database URL "${dbUrl}".`);
  }
  const scheme = match[1].toLowerCase();
  if (scheme !== 'postgres' && scheme !== 'postgresql') {
    throw new Error(`CRITICAL SAFETY ERROR: Invalid database URL protocol scheme "${scheme}". Only "postgres://" and "postgresql://" are permitted.`);
  }
  try {
    const parsed = new URL(dbUrl.trim());
    const host = (parsed.hostname || '').toLowerCase();
    if (!host || (!['localhost', '127.0.0.1', 'pglite'].includes(host) && !host.includes('.'))) {
      throw new Error('Invalid host');
    }
    return host;
  } catch (err: any) {
    if (err.message && err.message.startsWith('CRITICAL SAFETY ERROR')) {
      throw err;
    }
    throw new Error(`CRITICAL SAFETY ERROR: Invalid or malformed database URL "${dbUrl}".`);
  }
}

/**
 * Helper to extract Supabase project reference from direct or pooler connection URLs.
 * Direct format: postgresql://postgres:pass@db.[project-ref].supabase.co:5432/postgres
 * Session Pooler format: postgresql://postgres.[project-ref]:pass@aws-0-[region].pooler.supabase.com:5432/postgres
 */
export function extractSupabaseProjectRef(dbUrl: string): string | null {
  if (!dbUrl || dbUrl.trim() === '') return null;
  const normalized = /^[a-z0-9+-.]+:\/\//i.test(dbUrl) ? dbUrl : `postgresql://${dbUrl}`;
  try {
    const parsed = new URL(normalized);

    // 1. Check direct connection hostname strictly matching: db.[project-ref].supabase.co
    if (parsed.hostname.toLowerCase().endsWith('.supabase.co')) {
      const parts = parsed.hostname.toLowerCase().split('.');
      if (parts.length === 4 && parts[0] === 'db' && parts[2] === 'supabase' && parts[3] === 'co') {
        return parts[1];
      }
    }

    // 2. Check Session Pooler username: postgres.[project-ref] or user.[project-ref]
    if (parsed.username && parsed.username.includes('.')) {
      const userParts = parsed.username.split('.');
      if (userParts.length >= 2) {
        return userParts[1].toLowerCase();
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Seed script for Staging/Beta Environment.
 * Populates an isolated Supabase/PostgreSQL staging database with
 * deterministic test profile fixtures, canonical releases, physical copies,
 * published listings, and comment threads.
 *
 * Safety Rules:
 * 1. Restricts dbOverride strictly to test execution (NODE_ENV=test).
 * 2. UNCONDITIONALLY refuses NODE_ENV=production.
 * 3. Fails closed for missing/unconfigured DATABASE_URL outside test execution.
 * 4. UNCONDITIONALLY refuses DATABASE_URL targeting production hosts/database names/project references.
 * 5. Refuses external/unknown database target URLs unless parsed HOSTNAME or Session Pooler project reference EXACTLY matches configured staging identity.
 * 6. Detects profile account ID & username collisions bi-directionally and fails closed.
 * 7. Idempotent: uses fixed or configurable UUIDs and existing-record checks to prevent duplicate rows.
 * 8. Executes inside a database transaction to ensure atomicity.
 */
export async function seedStaging(options: SeedStagingOptions = {}) {
  const currentEnv = options.envOverride?.NODE_ENV || process.env.NODE_ENV || config.NODE_ENV;
  const allowStagingSeed =
    options.envOverride?.ALLOW_STAGING_SEED || process.env.ALLOW_STAGING_SEED;
  const stagingDbHost = (
    options.envOverride?.STAGING_DB_HOST ||
    process.env.STAGING_DB_HOST ||
    ''
  )
    .toLowerCase()
    .trim();

  const stagingProjectRef = (
    options.envOverride?.STAGING_DB_PROJECT_REF ||
    process.env.STAGING_DB_PROJECT_REF ||
    ''
  )
    .toLowerCase()
    .trim();

  const targetDbUrl =
    options.dbUrlOverride ||
    options.envOverride?.DATABASE_URL ||
    process.env.DATABASE_URL ||
    config.DATABASE_URL ||
    '';

  // Rule 1: Restrict custom dbOverride strictly to test execution
  if (options.dbOverride && currentEnv !== 'test') {
    throw new Error(
      'CRITICAL SAFETY ERROR: Custom dbOverride is strictly forbidden outside of test execution (NODE_ENV=test).'
    );
  }

  // Rule 2: Unconditional production mode refusal
  if (currentEnv === 'production') {
    throw new Error(
      'CRITICAL SAFETY ERROR: Staging seed script is UNCONDITIONALLY REFUSED in production mode.'
    );
  }

  // Rule 3: Fail closed for missing/unconfigured DATABASE_URL whenever dbOverride is not provided
  if (!targetDbUrl && !options.dbOverride) {
    throw new Error(
      'CRITICAL SAFETY ERROR: Missing or unconfigured DATABASE_URL. Target database URL must be explicitly provided.'
    );
  }

  let parsedHost = '';
  if (targetDbUrl) {
    parsedHost = extractDbHostname(targetDbUrl);
  }

  const urlProjectRef = extractSupabaseProjectRef(targetDbUrl);

  // Rule 4: Unconditional production database target refusal (checked against parsed host, URL, and project ref)
  const isProductionDbTarget =
    Boolean(parsedHost && /prod|production|vinyldrop-prod/i.test(parsedHost)) ||
    Boolean(targetDbUrl && /prod|production|vinyldrop-prod/i.test(targetDbUrl)) ||
    Boolean(urlProjectRef && /prod|production|vinyldrop-prod/i.test(urlProjectRef));

  if (isProductionDbTarget) {
    throw new Error(
      'CRITICAL SAFETY ERROR: Staging seed script is UNCONDITIONALLY REFUSED against production database target.'
    );
  }

  // Rule 5: Fail closed for external/unknown database target hosts using EXACT Host/Project Allowlist Match
  const isLocalHost = !parsedHost || ['localhost', '127.0.0.1', 'pglite'].includes(parsedHost);
  const isPoolerHost = parsedHost.endsWith('.pooler.supabase.com');

  if (!isLocalHost) {
    if (!stagingDbHost || !stagingProjectRef) {
      throw new Error(
        'CRITICAL SAFETY ERROR: STAGING_DB_HOST and STAGING_DB_PROJECT_REF environment variables must be explicitly set to allow seeding non-local database targets.'
      );
    }

    // Require EXACT hostname match against STAGING_DB_HOST for ALL non-local targets
    if (parsedHost !== stagingDbHost) {
      throw new Error(
        `CRITICAL SAFETY ERROR: Refusing to seed unlisted external host "${parsedHost}". Expected exact configured staging host "${stagingDbHost}".`
      );
    }

    if (isPoolerHost) {
      if (!urlProjectRef || urlProjectRef !== stagingProjectRef) {
        throw new Error(
          `CRITICAL SAFETY ERROR: Refusing to seed pooler target. Project reference in connection URL ("${urlProjectRef || 'unknown'}") does not match configured staging project reference "${stagingProjectRef}".`
        );
      }
    } else {
      if (!urlProjectRef || urlProjectRef !== stagingProjectRef) {
        throw new Error(
          `CRITICAL SAFETY ERROR: Refusing to seed direct target. Connection URL must use documented "db.<project-ref>.supabase.co" format and project reference ("${urlProjectRef || 'unknown'}") must match configured staging project reference "${stagingProjectRef}".`
        );
      }
    }

    if (allowStagingSeed !== 'true' && currentEnv !== 'staging') {
      throw new Error(
        'CRITICAL SAFETY ERROR: Refusing to seed external database target without explicit staging confirmation (NODE_ENV=staging or ALLOW_STAGING_SEED=true).'
      );
    }
  }

  // Rule 6: Explicit target confirmation check
  const isAllowedTarget =
    currentEnv === 'staging' || currentEnv === 'development' || currentEnv === 'test' || allowStagingSeed === 'true';

  if (!isAllowedTarget) {
    throw new Error(
      `CRITICAL SAFETY ERROR: Refusing to seed target environment "${currentEnv}". Explicit staging confirmation required (NODE_ENV=staging or ALLOW_STAGING_SEED=true).`
    );
  }

  // Rule 7: Ensure database client matches the verified target URL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let sqlClient: ReturnType<typeof postgres> | null = null;

  if (options.dbOverride) {
    db = options.dbOverride;
  } else if (targetDbUrl) {
    sqlClient = postgres(targetDbUrl);
    db = drizzle(sqlClient, { schema });
  } else {
    db = getDb();
  }

  try {
    // Configurable or deterministic Auth account IDs for profiles and foreign-key child rows
    const sellerId =
      options.accountIds?.sellerId ||
      options.envOverride?.STAGING_SELLER_ID ||
      process.env.STAGING_SELLER_ID ||
      '11111111-1111-4111-8111-111111111111';

    const buyerId =
      options.accountIds?.buyerId ||
      options.envOverride?.STAGING_BUYER_ID ||
      process.env.STAGING_BUYER_ID ||
      '22222222-2222-4222-8222-222222222222';

    const collectorId =
      options.accountIds?.collectorId ||
      options.envOverride?.STAGING_COLLECTOR_ID ||
      process.env.STAGING_COLLECTOR_ID ||
      '33333333-3333-4333-8333-333333333333';

    // Perform all seed insertions inside a single transaction where transaction support is available
    const runTransaction =
      typeof db.transaction === 'function'
        ? db.transaction.bind(db)
        : async (cb: (tx: typeof db) => Promise<void>) => cb(db);

    await runTransaction(async (tx: typeof db) => {
      // 1. Seed Profiles with Bi-directional Account ID & Username Collision Detection
      const testProfiles = [
        {
          id: sellerId,
          username: 'amsterdam_grooves',
          displayName: 'Amsterdam Grooves',
          bio: 'Crate digger & physical vinyl collector based in De Pijp, Amsterdam.',
          location: 'Amsterdam, NL',
          websiteUrl: 'https://vinyldrop.local/profiles/amsterdam_grooves',
        },
        {
          id: buyerId,
          username: 'spin_doctor',
          displayName: 'Spin Doctor',
          bio: 'Jazz & Electronic record enthusiast looking for clean original pressings.',
          location: 'Amsterdam Noord, NL',
          websiteUrl: null,
        },
        {
          id: collectorId,
          username: 'wax_collector',
          displayName: 'Wax Collector',
          bio: 'Rare soul, funk, and afrobeat vinyl curator.',
          location: 'Oost, Amsterdam',
          websiteUrl: null,
        },
      ];

      for (const profile of testProfiles) {
        const existingById = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, profile.id));

        const existingByUsername = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.username, profile.username));

        if (existingById.length > 0 && existingById[0].username !== profile.username) {
          throw new Error(
            `CRITICAL SEED ERROR: Profile ID ${profile.id} already exists with username @${existingById[0].username}, which conflicts with requested username @${profile.username}.`
          );
        }

        if (existingByUsername.length > 0 && existingByUsername[0].id !== profile.id) {
          throw new Error(
            `CRITICAL SEED ERROR: Profile @${profile.username} already exists with ID ${existingByUsername[0].id}, which conflicts with requested ID ${profile.id}.`
          );
        }

        if (existingById.length === 0 && existingByUsername.length === 0) {
          await tx.insert(profiles).values(profile);
        }
      }

      // 2. Seed Releases (using correct catalogueNumber column name matching schema)
      const testReleases = [
        {
          id: 'a1111111-1111-4111-8111-111111111111',
          title: 'Kind of Blue',
          artist: 'Miles Davis',
          label: 'Columbia',
          catalogueNumber: 'CS 8163',
          releaseYear: 1959,
          format: 'LP, Album, Reissue',
          genre: 'Jazz',
          coverArtUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        },
        {
          id: 'a2222222-2222-4222-8222-222222222222',
          title: 'Rumours',
          artist: 'Fleetwood Mac',
          label: 'Warner Bros. Records',
          catalogueNumber: 'BSK 3010',
          releaseYear: 1977,
          format: 'LP, Album',
          genre: 'Rock',
          coverArtUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
        },
        {
          id: 'a3333333-3333-4333-8333-333333333333',
          title: 'Random Access Memories',
          artist: 'Daft Punk',
          label: 'Columbia',
          catalogueNumber: '88883743781',
          releaseYear: 2013,
          format: '2xLP, Album',
          genre: 'Electronic',
          coverArtUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745',
        },
        {
          id: 'a4444444-4444-4444-8444-444444444444',
          title: 'Back to Black',
          artist: 'Amy Winehouse',
          label: 'Island Records',
          catalogueNumber: '1713041',
          releaseYear: 2006,
          format: 'LP, Album',
          genre: 'Funk / Soul',
          coverArtUrl: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c',
        },
        {
          id: 'a5555555-5555-4555-8555-555555555555',
          title: 'A Love Supreme',
          artist: 'John Coltrane',
          label: 'Impulse!',
          catalogueNumber: 'AS-77',
          releaseYear: 1965,
          format: 'LP, Album',
          genre: 'Jazz',
          coverArtUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6',
        },
      ];

      for (const relData of testReleases) {
        const existing = await tx.select().from(releases).where(eq(releases.id, relData.id));
        if (existing.length === 0) {
          await tx.insert(releases).values(relData);
        }
      }

      // 3. Seed Physical Copies & Listings with fixed UUIDs
      const seedListingsData = [
        {
          copyId: 'b1111111-1111-4111-8111-111111111111',
          listingId: 'c1111111-1111-4111-8111-111111111111',
          commentId: 'e1111111-1111-4111-8111-111111111111',
          releaseId: 'a1111111-1111-4111-8111-111111111111',
          ownerId: sellerId,
          mediaCondition: 'NM' as const,
          sleeveCondition: 'VG+' as const,
          notes: 'Crisp audio, slight corner wear on outer sleeve.',
          price: 3850, // €38.50
          description: 'Classic modal jazz landmark. Clean pressing, play-tested on Technics SL-1200.',
          commentContent: 'Is this pressing Japanese or US reissue?',
          commentAuthorId: buyerId,
        },
        {
          copyId: 'b2222222-2222-4222-8222-222222222222',
          listingId: 'c2222222-2222-4222-8222-222222222222',
          commentId: 'e2222222-2222-4222-8222-222222222222',
          releaseId: 'a2222222-2222-4222-8222-222222222222',
          ownerId: sellerId,
          mediaCondition: 'VG+' as const,
          sleeveCondition: 'VG+' as const,
          notes: 'Includes original lyric insert.',
          price: 2800, // €28.00
          description: 'Original 1977 US pressing with textured jacket and insert. Plays great.',
          commentContent: 'Are there any audible pops on Side 2?',
          commentAuthorId: collectorId,
        },
        {
          copyId: 'b3333333-3333-4333-8333-333333333333',
          listingId: 'c3333333-3333-4333-8333-333333333333',
          commentId: 'e3333333-3333-4333-8333-333333333333',
          releaseId: 'a3333333-3333-4333-8333-333333333333',
          ownerId: sellerId,
          mediaCondition: 'M' as const,
          sleeveCondition: 'NM' as const,
          notes: 'Sealed inside original poly sleeve.',
          price: 4500, // €45.00
          description: 'Gatefold 180g double LP. Flawless copy.',
          commentContent: 'Can meet up at Central Station for pickup.',
          commentAuthorId: buyerId,
        },
        {
          copyId: 'b4444444-4444-4444-8444-444444444444',
          listingId: 'c4444444-4444-4444-8444-444444444444',
          commentId: 'e4444444-4444-4444-8444-444444444444',
          releaseId: 'a4444444-4444-4444-8444-444444444444',
          ownerId: collectorId,
          mediaCondition: 'VG+' as const,
          sleeveCondition: 'VG' as const,
          notes: 'Minor seam split on top jacket.',
          price: null, // Trade only
          description: 'Looking to trade for Blue Note or Impulse! jazz titles in VG+ or better.',
          commentContent: 'Would you be interested in a Coltrane trade?',
          commentAuthorId: sellerId,
        },
      ];

      for (const item of seedListingsData) {
        // 3a. Physical Copy
        const existingCopy = await tx
          .select()
          .from(physicalCopies)
          .where(eq(physicalCopies.id, item.copyId));
        if (existingCopy.length === 0) {
          await tx.insert(physicalCopies).values({
            id: item.copyId,
            releaseId: item.releaseId,
            ownerId: item.ownerId,
            mediaCondition: item.mediaCondition,
            sleeveCondition: item.sleeveCondition,
            notes: item.notes,
          });
        }

        // 3b. Listing
        const existingListing = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, item.listingId));
        if (existingListing.length === 0) {
          await tx.insert(listings).values({
            id: item.listingId,
            physicalCopyId: item.copyId,
            sellerId: item.ownerId,
            price: item.price,
            currency: 'EUR',
            description: item.description,
            status: 'published',
          });
        }

        // 3c. Published Activity Event
        const existingPubEvent = await tx
          .select()
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.actorId, item.ownerId),
              eq(activityEvents.listingId, item.listingId),
              eq(activityEvents.eventType, 'listing.published')
            )
          );
        if (existingPubEvent.length === 0) {
          await tx.insert(activityEvents).values({
            eventType: 'listing.published',
            actorId: item.ownerId,
            listingId: item.listingId,
          });
        }

        // 3d. Comment
        const existingComment = await tx
          .select()
          .from(comments)
          .where(eq(comments.id, item.commentId));
        if (existingComment.length === 0) {
          await tx.insert(comments).values({
            id: item.commentId,
            listingId: item.listingId,
            authorId: item.commentAuthorId,
            content: item.commentContent,
          });
        }

        // 3e. Comment Activity Event
        const existingCmtEvent = await tx
          .select()
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.actorId, item.commentAuthorId),
              eq(activityEvents.listingId, item.listingId),
              eq(activityEvents.commentId, item.commentId),
              eq(activityEvents.eventType, 'comment.created')
            )
          );
        if (existingCmtEvent.length === 0) {
          await tx.insert(activityEvents).values({
            eventType: 'comment.created',
            actorId: item.commentAuthorId,
            listingId: item.listingId,
            commentId: item.commentId,
          });
        }
      }
    });
  } finally {
    if (sqlClient) {
      await sqlClient.end();
    }
  }
}

async function main() {
  console.log('=== The Vinyl Drop — Staging Seed Script ===');

  try {
    await seedStaging();
    console.log('=== Staging Seed Completed Successfully! ===');
    console.log('Pre-seeded staging test profile fixtures:');
    console.log('  1. Seller:    seller.beta@vinyldrop.local (@amsterdam_grooves)');
    console.log('  2. Buyer:     buyer.beta@vinyldrop.local (@spin_doctor)');
    console.log('  3. Collector: collector.beta@vinyldrop.local (@wax_collector)');
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed staging database:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
