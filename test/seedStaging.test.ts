import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { seedStaging, extractDbHostname, extractSupabaseProjectRef } from '../scripts/seed-staging';
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
  describe('Hostname & Project Ref Extraction Unit Tests', () => {
    it('should correctly extract hostname from connection URLs regardless of password or query params', () => {
      expect(extractDbHostname('postgresql://user:stagingpass@prod-db.supabase.co:5432/postgres')).toBe('prod-db.supabase.co');
      expect(extractDbHostname('postgresql://user:pass@vinyldrop-staging.supabase.co:5432/postgres?ssl=true')).toBe('vinyldrop-staging.supabase.co');
      expect(extractDbHostname('postgres://user:pass@vinyldrop-staging.supabase.co:5432/postgres')).toBe('vinyldrop-staging.supabase.co');
    });

    it('should reject invalid or missing protocol schemes in database connection URLs', () => {
      expect(() => extractDbHostname('http://localhost:3000')).toThrow(/Invalid database URL protocol scheme "http"/i);
      expect(() => extractDbHostname('https://vinyldrop-staging.supabase.co')).toThrow(/Invalid database URL protocol scheme "https"/i);
      expect(() => extractDbHostname('invalid_url_without_host')).toThrow(/Missing protocol scheme in database URL/i);
    });

    it('should fail closed for malformed or missing hostname URLs', () => {
      expect(() => extractDbHostname('postgresql:///postgres')).toThrow(/Invalid or malformed database URL/i);
    });

    it('should extract Supabase project reference strictly from db.[project-ref].supabase.co and Session Pooler connection URLs', () => {
      expect(
        extractSupabaseProjectRef('postgresql://postgres:pass@db.vinyldrop-staging.supabase.co:5432/postgres')
      ).toBe('vinyldrop-staging');

      expect(
        extractSupabaseProjectRef('postgresql://postgres.vinyldrop-staging:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres')
      ).toBe('vinyldrop-staging');

      expect(
        extractSupabaseProjectRef('postgresql://user:pass@localhost:5432/test')
      ).toBeNull();

      expect(
        extractSupabaseProjectRef('postgresql://postgres:pass@vinyldrop-staging.supabase.co:5432/postgres')
      ).toBeNull();

      expect(
        extractSupabaseProjectRef('postgresql://postgres:pass@app.vinyldrop-staging.supabase.co:5432/postgres')
      ).toBeNull();
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
          dbUrlOverride: 'postgresql://localhost:5432/postgres',
        })
      ).rejects.toThrow(/Explicit staging confirmation required/i);
    });

    it('should fail closed when database URL is missing and dbOverride is not provided even in test mode', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'test' },
          dbUrlOverride: '',
        })
      ).rejects.toThrow(/Missing or unconfigured DATABASE_URL/i);
    });

    it('should refuse matching project-ref username on an unapproved external host URL', async () => {
      await expect(
        seedStaging({
          envOverride: {
            NODE_ENV: 'staging',
            ALLOW_STAGING_SEED: 'true',
            STAGING_DB_HOST: 'vinyldrop-staging.supabase.co',
            STAGING_DB_PROJECT_REF: 'vinyldrop-staging',
          },
          dbUrlOverride: 'postgresql://postgres.vinyldrop-staging:pass@attacker.invalid:5432/postgres',
        })
      ).rejects.toThrow(/Refusing to seed unlisted external host "attacker.invalid"/i);
    });

    it('should refuse spoofed pooler host containing "pooler.supabase." substring', async () => {
      await expect(
        seedStaging({
          envOverride: {
            NODE_ENV: 'staging',
            ALLOW_STAGING_SEED: 'true',
            STAGING_DB_HOST: 'aws-0-eu-central-1.pooler.supabase.com',
            STAGING_DB_PROJECT_REF: 'vinyldrop-staging',
          },
          dbUrlOverride: 'postgresql://postgres.vinyldrop-staging:pass@aws-0-eu-central-1.pooler.supabase.attacker.invalid:5432/postgres',
        })
      ).rejects.toThrow(/Refusing to seed unlisted external host "aws-0-eu-central-1.pooler.supabase.attacker.invalid"/i);
    });

    it('should refuse pooler target if connection URL hostname differs from configured STAGING_DB_HOST', async () => {
      await expect(
        seedStaging({
          envOverride: {
            NODE_ENV: 'staging',
            ALLOW_STAGING_SEED: 'true',
            STAGING_DB_HOST: 'vinyldrop-staging.supabase.co',
            STAGING_DB_PROJECT_REF: 'vinyldrop-staging',
          },
          dbUrlOverride: 'postgresql://postgres.vinyldrop-staging:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
        })
      ).rejects.toThrow(/Refusing to seed unlisted external host "aws-0-eu-central-1.pooler.supabase.com". Expected exact configured staging host "vinyldrop-staging.supabase.co"/i);
    });

    it('should successfully pass safety checks for fully configured matching direct and pooler targets', async () => {
      // Minimal mock db that implements tx/query boundaries for seed execution
      const dummyDb = {
        transaction: async (cb: any) => cb({
          select: () => ({
            from: () => ({
              where: () => Promise.resolve([]),
            }),
          }),
          insert: () => ({
            values: () => Promise.resolve(),
          }),
        }),
      };

      await expect(
        seedStaging({
          dbOverride: dummyDb,
          envOverride: {
            NODE_ENV: 'test',
            ALLOW_STAGING_SEED: 'true',
            STAGING_DB_HOST: 'db.vinyldrop-staging.supabase.co',
            STAGING_DB_PROJECT_REF: 'vinyldrop-staging',
          },
          dbUrlOverride: 'postgresql://postgres:pass@db.vinyldrop-staging.supabase.co:5432/postgres',
        })
      ).resolves.not.toThrow();

      await expect(
        seedStaging({
          dbOverride: dummyDb,
          envOverride: {
            NODE_ENV: 'test',
            ALLOW_STAGING_SEED: 'true',
            STAGING_DB_HOST: 'aws-0-eu-central-1.pooler.supabase.com',
            STAGING_DB_PROJECT_REF: 'vinyldrop-staging',
          },
          dbUrlOverride: 'postgresql://postgres.vinyldrop-staging:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
        })
      ).resolves.not.toThrow();
    });

    it('should refuse execution when DATABASE_URL targets production even if NODE_ENV is staging or development', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging' },
          dbUrlOverride: 'postgresql://postgres:pass@vinyldrop-prod.supabase.co:5432/postgres',
        })
      ).rejects.toThrow(/UNCONDITIONALLY REFUSED against production database target/i);
    });

    it('should refuse execution when password contains "staging" but hostname is a production DB', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging' },
          dbUrlOverride: 'postgresql://user:stagingpass@vinyldrop-prod.supabase.co:5432/postgres',
        })
      ).rejects.toThrow(/UNCONDITIONALLY REFUSED against production database target/i);
    });

    it('should refuse execution when Session Pooler username contains a production project reference', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', STAGING_DB_PROJECT_REF: 'vinyldrop-staging' },
          dbUrlOverride: 'postgresql://postgres.vinyldrop-prod:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
        })
      ).rejects.toThrow(/UNCONDITIONALLY REFUSED against production database target/i);
    });

    it('should refuse execution against Session Pooler with wrong or mismatched project reference', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', ALLOW_STAGING_SEED: 'true', STAGING_DB_HOST: 'aws-0-eu-central-1.pooler.supabase.com', STAGING_DB_PROJECT_REF: 'vinyldrop-staging' },
          dbUrlOverride: 'postgresql://postgres.other-project:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
        })
      ).rejects.toThrow(/Project reference in connection URL \("other-project"\) does not match configured staging project reference "vinyldrop-staging"/i);
    });

    it('should refuse execution against an unlisted lookalike host (e.g. staging.example.invalid or vinyldrop-staging.attacker.invalid)', async () => {
      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', ALLOW_STAGING_SEED: 'true', STAGING_DB_HOST: 'vinyldrop-staging.supabase.co', STAGING_DB_PROJECT_REF: 'vinyldrop-staging' },
          dbUrlOverride: 'postgresql://user:pass@staging.example.invalid:5432/postgres',
        })
      ).rejects.toThrow(/Refusing to seed unlisted external host/i);

      await expect(
        seedStaging({
          envOverride: { NODE_ENV: 'staging', ALLOW_STAGING_SEED: 'true', STAGING_DB_HOST: 'vinyldrop-staging.supabase.co', STAGING_DB_PROJECT_REF: 'vinyldrop-staging' },
          dbUrlOverride: 'postgresql://user:pass@vinyldrop-staging.attacker.invalid:5432/postgres',
        })
      ).rejects.toThrow(/Refusing to seed unlisted external host/i);
    });

    it('should strictly forbid dbOverride when an external database URL is supplied outside NODE_ENV=test', async () => {
      await expect(
        seedStaging({
          dbOverride: {},
          envOverride: { NODE_ENV: 'staging', ALLOW_STAGING_SEED: 'true', STAGING_DB_HOST: 'vinyldrop-staging.supabase.co' },
          dbUrlOverride: 'postgresql://user:pass@vinyldrop-staging.supabase.co:5432/postgres',
        })
      ).rejects.toThrow(/Custom dbOverride is strictly forbidden outside of test execution/i);
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

    it('should reject seeding conflicting usernames when profile ID already exists with a different username', async () => {
      // Insert a profile where ID matches sellerId but username is different
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

      const existingSellerId = '11111111-1111-4111-8111-111111111111';
      await customDb.insert(profiles).values({
        id: existingSellerId,
        username: 'existing_different_username',
        displayName: 'Different User',
      });

      await expect(
        seedStaging({
          dbOverride: customDb,
          envOverride: { NODE_ENV: 'test' },
          accountIds: {
            sellerId: existingSellerId,
          },
        })
      ).rejects.toThrow(/already exists with username @existing_different_username, which conflicts with requested username @amsterdam_grooves/i);

      await customDbPglite.close();
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
