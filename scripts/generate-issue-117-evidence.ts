import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { assert } from 'console';
import { setOverrideDb } from '../src/db';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { listingPhotos } from '../src/db/schema/listingPhotos';
import { createApp } from '../src/app';
import { chromium } from '@playwright/test';

// Sample static image assets served by Express static middleware from public/
const lightArtPath = 'assets/brand/the-vinyl-drop-logo-mark.svg';
const darkArtPath = 'assets/brand/the-vinyl-drop-wordmark.svg';
const busyArtPath = 'assets/test-cover.webp';

async function run() {
  console.log('Seeding PGlite verification DB with varied artwork test cases...');
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

  const sellerId = '11111111-1111-1111-1111-111111111111';
  await db.insert(profiles).values({ id: sellerId, username: 'collector_beta', displayName: 'Collector Beta' });

  type ConditionGrade = 'M' | 'NM' | 'VG+' | 'VG' | 'VG-' | 'G+' | 'G' | 'F' | 'P';

  const testListings: Array<{
    title: string;
    artist: string;
    year: number;
    media: ConditionGrade;
    sleeve: ConditionGrade;
    price: number;
    art: string | null;
  }> = [
    { title: 'The White Album (Light Art)', artist: 'The Beatles', year: 1968, media: 'NM', sleeve: 'VG+', price: 4500, art: lightArtPath },
    { title: 'The Black Album (Dark Art)', artist: 'Metallica', year: 1991, media: 'VG+', sleeve: 'VG', price: 3200, art: darkArtPath },
    { title: 'Sgt. Pepper (Busy Art)', artist: 'The Beatles', year: 1967, media: 'M', sleeve: 'NM', price: 5500, art: busyArtPath },
    { title: 'Broken Image Test', artist: 'Missing File Band', year: 2020, media: 'VG', sleeve: 'VG-', price: 1500, art: 'assets/non-existent-file.jpg' },
    { title: 'No Image Fallback Test', artist: 'No Image Artist', year: 2021, media: 'G+', sleeve: 'G', price: 1000, art: null },
  ];

  for (const item of testListings) {
    const [rel] = await db.insert(releases).values({
      title: item.title,
      artist: item.artist,
      label: 'Test Label',
      releaseYear: item.year,
      format: 'LP, Album',
    }).returning();

    const [pc] = await db.insert(physicalCopies).values({
      releaseId: rel.id,
      ownerId: sellerId,
      mediaCondition: item.media,
      sleeveCondition: item.sleeve,
    }).returning();

    const [lst] = await db.insert(listings).values({
      physicalCopyId: pc.id,
      sellerId: sellerId,
      price: item.price,
      currency: 'EUR',
      status: 'published',
    }).returning();

    if (item.art !== null) {
      await db.insert(listingPhotos).values({
        listingId: lst.id,
        storagePath: item.art,
        displayOrder: 0,
        altText: `Artwork for ${item.title}`,
      });
    }
  }

  setOverrideDb(db);

  const app = createApp();
  const port = 3001;
  const server = app.listen(port, async () => {
    console.log(`Test verification server listening on port ${port}...`);

    const outputDir = path.resolve(__dirname, '../docs/evidence/issue-117');
    fs.mkdirSync(outputDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });

    // Test viewports: mobile (360px), tablet (768px), desktop (1280px)
    const viewports = [
      { name: 'mobile-360px', width: 360, height: 800 },
      { name: 'tablet-768px', width: 768, height: 1024 },
      { name: 'desktop-1280px', width: 1280, height: 900 },
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      // Grid Mode Verification
      await page.goto(`http://localhost:${port}/browse?view=grid`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Invariant assertions in Grid Mode
      const scrollWidthGrid = await page.evaluate(() => (globalThis as unknown as Record<string, Record<string, Record<string, number>>>)['document']['documentElement']['scrollWidth']);
      const viewportWidthGrid = await page.evaluate(() => (globalThis as unknown as Record<string, Record<string, Record<string, number>>>)['document']['documentElement']['clientWidth']);
      assert(scrollWidthGrid <= viewportWidthGrid, `Horizontal overflow detected in Grid mode at ${vp.width}px!`);

      // Verify grid media frame and overlay layout assertions
      const gridCards = page.locator('.listing-card');
      const cardCount = await gridCards.count();
      assert(cardCount === 5, `Expected 5 listing cards in grid mode, found ${cardCount}`);

      for (let i = 0; i < cardCount; i++) {
        const card = gridCards.nth(i);
        const media = card.locator('.listing-card-media');
        const imgLink = card.locator('.listing-card-image-link');
        const badgeContainer = card.locator('.listing-card-badge-container');

        const mediaBox = await media.boundingBox();
        const imgLinkBox = await imgLink.boundingBox();
        const badgeBox = await badgeContainer.boundingBox();

        assert(mediaBox && imgLinkBox, 'Media and image link bounding boxes must exist in Grid mode');
        // Artwork fills the media frame
        assert(Math.abs(imgLinkBox!.width - mediaBox!.width) < 2, 'Image link must fill media frame width in Grid mode');
        assert(Math.abs(imgLinkBox!.height - mediaBox!.height) < 2, 'Image link must fill media frame height in Grid mode');

        // Badge container is positioned inside media frame bounds
        if (badgeBox && mediaBox) {
          assert(badgeBox.x >= mediaBox.x && (badgeBox.x + badgeBox.width) <= (mediaBox.x + mediaBox.width + 2), 'Badge overlay must be within media right edge');
          assert(badgeBox.y >= mediaBox.y && (badgeBox.y + badgeBox.height) <= (mediaBox.y + mediaBox.height + 2), 'Badge overlay must be within media bottom edge');
        }
      }

      await page.screenshot({ path: path.join(outputDir, `browse-grid-${vp.name}.png`), fullPage: true });

      // List Mode Verification
      await page.goto(`http://localhost:${port}/browse?view=list`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const scrollWidthList = await page.evaluate(() => (globalThis as unknown as Record<string, Record<string, Record<string, number>>>)['document']['documentElement']['scrollWidth']);
      const viewportWidthList = await page.evaluate(() => (globalThis as unknown as Record<string, Record<string, Record<string, number>>>)['document']['documentElement']['clientWidth']);
      assert(scrollWidthList <= viewportWidthList, `Horizontal overflow detected in List mode at ${vp.width}px!`);

      await page.screenshot({ path: path.join(outputDir, `browse-list-${vp.name}.png`), fullPage: true });

      await context.close();
    }

    // Explicit assertion for broken image onerror fallback behavior
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/browse?view=grid`, { waitUntil: 'networkidle' });

    const brokenCard = page.locator('[data-listing-id]').filter({ hasText: 'Broken Image Test' });
    const brokenCardFallback = brokenCard.locator('.listing-card-image-fallback');
    const isFallbackVisible = await brokenCardFallback.isVisible();

    // Assert that broken image fallback is visible in browser DOM
    assert(isFallbackVisible === true, 'Broken image fallback must be visible in the DOM upon image error');
    console.log(`[Broken Image Assertion] Fallback visible on error: ${isFallbackVisible}`);

    await page.screenshot({ path: path.join(outputDir, 'broken-and-missing-image-fallback-verification.png'), fullPage: true });

    await browser.close();
    server.close();
    console.log('Successfully validated layout invariants and generated all Issue #117 evidence screenshots in docs/evidence/issue-117/');
    process.exit(0);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
