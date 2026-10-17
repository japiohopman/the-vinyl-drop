import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import assert from 'node:assert/strict';
import { setOverrideDb } from '../src/db';
import { profiles } from '../src/db/schema/profiles';
import { releases } from '../src/db/schema/releases';
import { physicalCopies } from '../src/db/schema/physicalCopies';
import { listings } from '../src/db/schema/listings';
import { listingPhotos } from '../src/db/schema/listingPhotos';
import { createApp } from '../src/app';
import { chromium } from '@playwright/test';

// Deterministic test SVG images served via Express static middleware from public/assets/svg/
const lightArtPath = 'assets/svg/round-star.svg';
const darkArtPath = 'assets/svg/user.svg';
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

    const viewports = [
      { name: 'mobile-360px', width: 360, height: 800 },
      { name: 'tablet-768px', width: 768, height: 1024 },
      { name: 'desktop-1280px', width: 1280, height: 900 },
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      // ==========================================
      // GRID MODE VERIFICATION & LAYOUT ASSERTIONS
      // ==========================================
      await page.goto(`http://localhost:${port}/browse?view=grid`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Invariant 1: No horizontal overflow
      const scrollWidthGrid = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document.documentElement.scrollWidth);
      const viewportWidthGrid = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { clientWidth: number } } }).document.documentElement.clientWidth);
      assert.ok(scrollWidthGrid <= viewportWidthGrid, `Horizontal overflow detected in Grid mode at ${vp.width}px! (${scrollWidthGrid} > ${viewportWidthGrid})`);

      const gridCards = page.locator('.listing-card');
      const gridCardCount = await gridCards.count();
      assert.equal(gridCardCount, 5, `Expected 5 listing cards in grid mode, found ${gridCardCount}`);

      // Verify artwork loads successfully on valid image cards
      const validImageCards = ['The White Album (Light Art)', 'The Black Album (Dark Art)', 'Sgt. Pepper (Busy Art)'];
      for (const title of validImageCards) {
        const card = page.locator('[data-listing-id]').filter({ hasText: title });
        const img = card.locator('.listing-card-image');
        const isLoaded = await img.evaluate((el) => {
          const image = el as unknown as { complete: boolean; naturalWidth: number };
          return image.complete && image.naturalWidth > 0;
        });
        assert.ok(isLoaded, `Artwork image failed to load for card: ${title}`);

        // Invariant: Artwork isn't cropped (object-fit: contain)
        const objectFit = await img.evaluate((el) => {
          const win = (globalThis as unknown as { window: { getComputedStyle: (e: unknown) => { objectFit: string } } }).window;
          return win.getComputedStyle(el).objectFit;
        });
        assert.equal(objectFit, 'contain', `Artwork must use object-fit: contain to prevent cropping on ${title}`);
      }

      for (let i = 0; i < gridCardCount; i++) {
        const card = gridCards.nth(i);
        const media = card.locator('.listing-card-media');
        const imgLink = card.locator('.listing-card-image-link');
        const badgeContainer = card.locator('.listing-card-badge-container');

        const mediaBox = await media.boundingBox();
        const imgLinkBox = await imgLink.boundingBox();
        const badgeBox = await badgeContainer.boundingBox();

        assert.ok(mediaBox && imgLinkBox, 'Media and image link bounding boxes must exist in Grid mode');

        // Invariant 2: Artwork link fills the media frame
        assert.ok(Math.abs(imgLinkBox!.width - mediaBox!.width) < 2, `Image link width (${imgLinkBox!.width}) must fill media frame width (${mediaBox!.width}) in Grid mode at ${vp.width}px`);
        assert.ok(Math.abs(imgLinkBox!.height - mediaBox!.height) < 2, `Image link height (${imgLinkBox!.height}) must fill media frame height (${mediaBox!.height}) in Grid mode at ${vp.width}px`);

        // Invariant 3: Grid badges stay anchored within the media frame bounds
        if (badgeBox && mediaBox) {
          assert.ok(badgeBox.x >= mediaBox.x && (badgeBox.x + badgeBox.width) <= (mediaBox.x + mediaBox.width + 2), `Grid badge overlay right edge (${badgeBox.x + badgeBox.width}) must stay inside media frame (${mediaBox.x + mediaBox.width})`);
          assert.ok(badgeBox.y >= mediaBox.y && (badgeBox.y + badgeBox.height) <= (mediaBox.y + mediaBox.height + 2), `Grid badge overlay bottom edge (${badgeBox.y + badgeBox.height}) must stay inside media frame (${mediaBox.y + mediaBox.height})`);
        }
      }

      await page.screenshot({ path: path.join(outputDir, `browse-grid-${vp.name}.png`), fullPage: true });

      // ==========================================
      // LIST MODE VERIFICATION & LAYOUT ASSERTIONS
      // ==========================================
      await page.goto(`http://localhost:${port}/browse?view=list`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Invariant 1: No horizontal overflow in List mode
      const scrollWidthList = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document.documentElement.scrollWidth);
      const viewportWidthList = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { clientWidth: number } } }).document.documentElement.clientWidth);
      assert.ok(scrollWidthList <= viewportWidthList, `Horizontal overflow detected in List mode at ${vp.width}px! (${scrollWidthList} > ${viewportWidthList})`);

      // Invariant 4: List conditions are NOT overlaid inside the media frame; they belong in listing-card-meta
      const listCards = page.locator('.listing-card');
      const listCardCount = await listCards.count();
      assert.equal(listCardCount, 5, `Expected 5 listing cards in list mode, found ${listCardCount}`);

      for (let i = 0; i < listCardCount; i++) {
        const card = listCards.nth(i);
        const mediaBadgeContainer = card.locator('.listing-card-media .listing-card-badge-container');
        const listConditionContainer = card.locator('.listing-card-list-condition');

        const mediaBadgeCount = await mediaBadgeContainer.count();
        const listConditionCount = await listConditionContainer.count();

        assert.equal(mediaBadgeCount, 0, 'In List mode, condition badges must NOT be inside .listing-card-media');
        assert.equal(listConditionCount, 1, 'In List mode, condition badges must render inside .listing-card-list-condition');
      }

      await page.screenshot({ path: path.join(outputDir, `browse-list-${vp.name}.png`), fullPage: true });

      await context.close();
    }

    // =========================================================================
    // BROKEN IMAGE & MISSING IMAGE DOM FALLBACK VISIBILITY ASSERTIONS
    // =========================================================================
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/browse?view=grid`, { waitUntil: 'networkidle' });

    // 1. Broken image fallback assertion (onerror triggered)
    const brokenCard = page.locator('[data-listing-id]').filter({ hasText: 'Broken Image Test' });
    const brokenImg = brokenCard.locator('.listing-card-image');
    // Wait for img onerror event handler to execute
    await brokenImg.evaluate((el) => {
      const img = el as unknown as { complete: boolean; naturalWidth: number; dispatchEvent: (e: unknown) => void };
      if (!img.complete || img.naturalWidth === 0) {
        img.dispatchEvent(new Event('error'));
      }
    });
    await page.waitForTimeout(200);

    const brokenCardFallback = brokenCard.locator('.listing-card-image-fallback');
    const isBrokenFallbackVisible = await brokenCardFallback.isVisible();
    assert.equal(isBrokenFallbackVisible, true, 'Broken image fallback must be visible in the DOM upon image onerror failure');
    console.log(`[Broken Image Assertion] Fallback visible on error: ${isBrokenFallbackVisible}`);

    // 2. Missing image fallback assertion (no imageUrl provided)
    const noImageCard = page.locator('[data-listing-id]').filter({ hasText: 'No Image Fallback Test' });
    const noImageFallback = noImageCard.locator('.listing-card-image-fallback');
    const isMissingFallbackVisible = await noImageFallback.isVisible();
    assert.equal(isMissingFallbackVisible, true, 'Missing image fallback must be visible in the DOM when no imageUrl is provided');
    console.log(`[Missing Image Assertion] Fallback visible when imageUrl missing: ${isMissingFallbackVisible}`);

    await page.screenshot({ path: path.join(outputDir, 'broken-and-missing-image-fallback-verification.png'), fullPage: true });

    await browser.close();
    server.close();
    console.log('Successfully validated all layout invariants with throwing node:assert/strict assertions and generated all Issue #117 evidence screenshots!');
    process.exit(0);
  });
}

run().catch((err) => {
  console.error('Evidence generator failed throwing assertion:', err);
  process.exit(1);
});
