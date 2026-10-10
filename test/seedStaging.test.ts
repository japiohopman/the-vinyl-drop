import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { seedStaging, extractDbHostname } from '../scripts/seed-staging';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { listingPhotos } from '../src/db/schema/listingPhotos';
import { comments } from '../src/db/schema/comments';
import { activityEvents } from '../src/db/schema/activityEvents';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Staging Seed Script Safety & Idempotency', () => {
  describe('Hostname Extraction Unit Tests', () => {
    it('should correctly extract hostname from connection URLs regardless of password or query params', () => {
      expect(extractDbHostname('postgresql://user:stagingpass@prod-db.supabase.co:5432/postgres')).toBe('prod-db.supabase.co');
      expect(extractDbHostname('postgresql://user:pass@vinyldrop-staging.supabase.co:5432/postgres?ssl=true')).toBe('vinyldrop-staging.supabase.co');
      expect(extractDbHostname('http://localhost:3000')).toBe('localhost');
    });

    it('should fail closed for malformed or missing hostname URLs', () => {
      expect(() => extractDbHostname('invalid_url_without_host')).toThrow(/Invalid or malformed database URL/i);
    });
  });

  describe('Safety Guards', () => {
    it('should unconditionally refuse production mode even if extra flags are supplied', async () => {
      const originalArgv = process.argv;
      process.argv = [...originalArgv, '--force'];

      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'production' },
        })
      ).rejects.toThrow(/UNCONDITIONALLY REFUSED in production mode/i);

      process.argv = originalArgv;
    });

    it('should refuse unconfirmed non-staging environments', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'unknown_env', ALLOW_STAGING_SEED: 'false' },
          dbUrlOverride: 'http://localhost:3000',
        })
      ).rejects.toThrow(/Explicit staging confirmation required/i);
    });

    it('should fail closed when DATABASE_URL is missing outside NODE_ENV=test', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', DATABASE_URL: '' },
          dbUrlOverride: '',
        })
      ).rejects.toThrow(/Missing or unconfigured DATABASE_URL/i);
    });

    it('should strictly forbid custom dbOverride outside NODE_ENV=test', async () => {
      await expect(
        seedStaging({
          dbOverride: {},
          envOverride: { NODE_ENV: 'staging' },
          dbUrlOverride: 'http://localhost:3000',
        })
      ).rejects.toThrow(/Custom dbOverride is strictly forbidden outside of test execution/i);
    });

    it('should refuse execution when DATABASE_URL targets production even if NODE_ENV is staging or development', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', STAGING_DB_HOST: 'vinyldrop-staging.supabase.co' },
          dbUrlOverride: 'postgresql://postgres:pass@vinyldrop-prod.supabase.co:5432/postgres',
        })
      ).rejects.toThrow(/UNCONDITIONALLY REFUSED against production database target/i);
    });

    it('should refuse execution when password contains "staging" but hostname is a production DB', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', STAGING_DB_HOST: 'vinyldrop-staging.supabase.co' },
          dbUrlOverride: 'postgresql://user:stagingpass@vinyldrop-prod.supabase.co:5432/postgres',
        })
      ).rejects.toThrow(/UNCONDITIONALLY REFUSED against production database target/i);
    });

    it('should refuse execution against an unlisted lookalike host (e.g. staging.example.invalid or vinyldrop-staging.attacker.invalid)', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', ALLOW_STAGING_SEED: 'true', STAGING_DB_HOST: 'vinyldrop-staging.supabase.co' },
          dbUrlOverride: 'postgresql://user:pass@staging.example.invalid:5432/postgres',
        })
      ).rejects.toThrow(/Refusing to seed unlisted external host/i);

      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', ALLOW_STAGING_SEED: 'true', STAGING_DB_HOST: 'vinyldrop-staging.supabase.co' },
          dbUrlOverride: 'postgresql://user:pass@vinyldrop-staging.attacker.invalid:5432/postgres',
        })
      ).rejects.toThrow(/Refusing to seed unlisted external host/i);
    });
  });

  describe('Database Idempotency & Configurable Account IDs', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let pglite: PGlite;

    beforeAll(async () => {
      pglite = new PGlite();
      await pglite.waitReady;
      db = drizzle(pglite, { schema });

      // Apply migration SQL statements
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
    });

    afterAll(async () => {
      await pglite.close();
    });

    it('should seed data with default profile UUIDs on first run and remain strictly idempotent on second run', async () => {
      const envOverride = { NODE_ENV: 'test' };

      // First Seed Run
      await seedStaging({ dbOverride: db, envOverride });

      const profilesFirst = await db.select().from(profiles);
      const releasesFirst = await db.select().from(releases);
      const physicalCopiesFirst = await db.select().from(physicalCopies);
      const listingsFirst = await db.select().from(listings);
      const photosFirst = await db.select().from(listingPhotos);
      const commentsFirst = await db.select().from(comments);
      const eventsFirst = await db.select().from(activityEvents);

      expect(profilesFirst.length).toBe(3);
      expect(releasesFirst.length).toBe(5);
      expect(releasesFirst[0].catalogueNumber).toBe('CS 8163'); // Regression check for catalogueNumber property persistence
      expect(physicalCopiesFirst.length).toBe(4);
      expect(listingsFirst.length).toBe(4);
      expect(photosFirst.length).toBe(0); // Un-uploaded photos omitted from seed
      expect(commentsFirst.length).toBe(4);
      expect(eventsFirst.length).toBe(8); // 4 published + 4 commented

      // Second Seed Run (Idempotency Check)
      await seedStaging({ dbOverride: db, envOverride });

      const profilesSecond = await db.select().from(profiles);
      const releasesSecond = await db.select().from(releases);
      const physicalCopiesSecond = await db.select().from(physicalCopies);
      const listingsSecond = await db.select().from(listings);
      const photosSecond = await db.select().from(listingPhotos);
      const commentsSecond = await db.select().from(comments);
      const eventsSecond = await db.select().from(activityEvents);

      expect(profilesSecond.length).toBe(profilesFirst.length);
      expect(releasesSecond.length).toBe(releasesFirst.length);
      expect(physicalCopiesSecond.length).toBe(physicalCopiesFirst.length);
      expect(listingsSecond.length).toBe(listingsFirst.length);
      expect(photosSecond.length).toBe(photosFirst.length);
      expect(commentsSecond.length).toBe(commentsFirst.length);
      expect(eventsSecond.length).toBe(eventsFirst.length);
    });

    it('should reject seeding conflicting account IDs when profiles already exist with same usernames', async () => {
      const customSellerId = '77777777-7777-4777-8777-777777777777';

      await expect(
        seedStaging({
          dbOverride: db,
          envOverride: { NODE_ENV: 'test' },
          accountIds: {
            sellerId: customSellerId,
          },
        })
      ).rejects.toThrow(/already exists with ID.*conflicts with requested ID/i);
    });

    it('should support pre-provisioned Auth user IDs via accountIds option on a clean database', async () => {
      const customDbPglite = new PGlite();
      await customDbPglite.waitReady;
      const customDb = drizzle(customDbPglite, { schema });

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
          await customDbPglite.exec(statement);
        }
      }

      const customSellerId = '77777777-7777-4777-8777-777777777777';
      const customBuyerId = '88888888-8888-4888-8888-888888888888';
      const customCollectorId = '99999999-9999-4999-8999-999999999999';

      await seedStaging({
        dbOverride: customDb,
        envOverride: { NODE_ENV: 'test' },
        accountIds: {
          sellerId: customSellerId,
          buyerId: customBuyerId,
          collectorId: customCollectorId,
        },
      });

      const customSellerProfile = await customDb
        .select()
        .from(profiles)
        .where(eq(profiles.id, customSellerId));
      expect(customSellerProfile.length).toBe(1);

      const customSellerListings = await customDb
        .select()
        .from(listings)
        .where(eq(listings.sellerId, customSellerId));
      expect(customSellerListings.length).toBeGreaterThan(0);

      await customDbPglite.close();
    });
  });
});
