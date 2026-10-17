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
import { chromium, expect, type Locator } from '@playwright/test';

async function assertLoadedImage(image: Locator, expectedSrc: string) {
  await expect.poll(() => image.evaluate((el) => {
    const img = el as unknown as { src: string; complete: boolean; naturalWidth: number };
    return { src: img.src, complete: img.complete, hasPixels: img.naturalWidth > 0 };
  })).toEqual({ src: expectedSrc, complete: true, hasPixels: true });
}

async function run() {
  console.log('Seeding PGlite verification DB for Issue #65 detail page artwork...');
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
  await db.insert(profiles).values({
    id: sellerId,
    username: 'jazz_vault',
    displayName: 'Jazz Vault Collector',
  });

  // 1. Listing with multiple photos and VALID release artwork
  const [rel1] = await db.insert(releases).values({
    title: 'A Love Supreme',
    artist: 'John Coltrane',
    label: 'Impulse!',
    releaseYear: 1965,
    format: 'LP, Album',
    coverArtUrl: '/assets/test-light-cover.svg',
  }).returning();

  const [pc1] = await db.insert(physicalCopies).values({
    releaseId: rel1.id,
    ownerId: sellerId,
    mediaCondition: 'NM',
    sleeveCondition: 'VG+',
  }).returning();

  const [lst1] = await db.insert(listings).values({
    physicalCopyId: pc1.id,
    sellerId: sellerId,
    price: 3495,
    currency: 'EUR',
    status: 'published',
    description: 'Original stereo pressing in exceptional condition.',
  }).returning();

  await db.insert(listingPhotos).values([
    {
      listingId: lst1.id,
      storagePath: 'assets/test-cover.webp',
      displayOrder: 0,
      altText: 'Front sleeve photo of A Love Supreme',
    },
    {
      listingId: lst1.id,
      storagePath: 'assets/test-dark-cover.svg',
      displayOrder: 1,
      altText: 'Gatefold inner photo of A Love Supreme',
    },
    {
      listingId: lst1.id,
      storagePath: 'assets/broken-thumbnail.webp',
      displayOrder: 2,
      altText: 'Broken seller photo',
    },
  ]);

  // 2. Listing with broken seller photo AND valid release artwork (/assets/test-light-cover.svg)
  const [rel2] = await db.insert(releases).values({
    title: 'Giant Steps',
    artist: 'John Coltrane',
    label: 'Atlantic',
    releaseYear: 1960,
    format: 'LP',
    coverArtUrl: '/assets/test-light-cover.svg',
  }).returning();

  const [pc2] = await db.insert(physicalCopies).values({
    releaseId: rel2.id,
    ownerId: sellerId,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
  }).returning();

  const [lst2] = await db.insert(listings).values({
    physicalCopyId: pc2.id,
    sellerId: sellerId,
    price: 4000,
    currency: 'EUR',
    status: 'published',
  }).returning();

  await db.insert(listingPhotos).values({
    listingId: lst2.id,
    storagePath: 'assets/broken-photo-1.webp',
    displayOrder: 0,
    altText: 'Broken photo on Giant Steps',
  });

  // 3. Listing with broken seller photo AND broken release artwork -> placeholder fallback
  const [rel3] = await db.insert(releases).values({
    title: 'Blue Train',
    artist: 'John Coltrane',
    label: 'Blue Note',
    releaseYear: 1957,
    format: '12" Vinyl',
    coverArtUrl: '/assets/broken-release-art.jpg',
  }).returning();

  const [pc3] = await db.insert(physicalCopies).values({
    releaseId: rel3.id,
    ownerId: sellerId,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
  }).returning();

  const [lst3] = await db.insert(listings).values({
    physicalCopyId: pc3.id,
    sellerId: sellerId,
    price: 4500,
    currency: 'EUR',
    status: 'published',
  }).returning();

  await db.insert(listingPhotos).values([
    {
      listingId: lst3.id,
      storagePath: 'assets/broken-photo-2.webp',
      displayOrder: 0,
      altText: 'Broken photo on Blue Train',
    },
    {
      listingId: lst3.id,
      storagePath: 'assets/test-cover.webp',
      displayOrder: 1,
      altText: 'Working photo on Blue Train',
    },
  ]);

  // 4. Listing with NO seller photo AND broken release artwork -> placeholder fallback
  const [rel4] = await db.insert(releases).values({
    title: 'My Favorite Things',
    artist: 'John Coltrane',
    label: 'Atlantic',
    releaseYear: 1961,
    format: 'LP',
    coverArtUrl: '/assets/broken-release-art.jpg',
  }).returning();

  const [pc4] = await db.insert(physicalCopies).values({
    releaseId: rel4.id,
    ownerId: sellerId,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
  }).returning();

  const [lst4] = await db.insert(listings).values({
    physicalCopyId: pc4.id,
    sellerId: sellerId,
    price: 3000,
    currency: 'EUR',
    status: 'published',
  }).returning();

  setOverrideDb(db);

  const app = createApp();
  const port = 3002;
  const server = app.listen(port, async () => {
    console.log(`Issue #65 verification server listening on port ${port}...`);

    const outputDir = path.resolve(__dirname, '../docs/evidence/issue-65');
    fs.mkdirSync(outputDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });

    const viewports = [
      { name: 'mobile-360px', width: 360, height: 800 },
      { name: 'desktop-1280px', width: 1280, height: 900 },
    ];

    // Case 1: Verify detail page multi-photo selection, layout, and overflow across viewports
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      await page.goto(`http://localhost:${port}/listings/${lst1.id}`, { waitUntil: 'domcontentloaded' });

      // Invariant: No horizontal document overflow
      const scrollWidth = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document.documentElement.scrollWidth);
      const viewportWidth = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { clientWidth: number } } }).document.documentElement.clientWidth);
      assert.ok(scrollWidth <= viewportWidth, `Horizontal overflow on detail page at ${vp.width}px! (${scrollWidth} > ${viewportWidth})`);

      const mainImg = page.locator('#main-photo-img');
      await mainImg.scrollIntoViewIfNeeded();

      // Verify object-fit: contain on main photo to ensure non-square condition photos aren't cropped
      const objectFit = await mainImg.evaluate((el) => {
        const win = (globalThis as unknown as { window: { getComputedStyle: (e: unknown) => { objectFit: string } } }).window;
        return win.getComputedStyle(el).objectFit;
      });
      assert.equal(objectFit, 'contain', `Main detail photo must use object-fit: contain at ${vp.width}px`);

      // Verify the exact initial seller photo URL and successful load
      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/test-cover.webp`);
      const initialAlt = await mainImg.getAttribute('alt');
      assert.equal(initialAlt, 'Front sleeve photo of A Love Supreme');

      // Interact with thumbnail gallery via keyboard activation (Enter key)
      const thumbBtns = page.locator('.thumbnail-btn');
      const thumbCount = await thumbBtns.count();
      assert.equal(thumbCount, 3, 'Expected 3 thumbnail buttons for lst1');

      // Focus and press Enter on second thumbnail
      await thumbBtns.nth(1).focus();
      await page.keyboard.press('Enter');

      // Assert thumbnail selection state updates
      const isSecondSelected = await thumbBtns.nth(1).evaluate((el) => el.classList.contains('selected'));
      const secondAriaCurrent = await thumbBtns.nth(1).getAttribute('aria-current');
      assert.ok(isSecondSelected, 'Second thumbnail button must have selected class when activated via keyboard');
      assert.equal(secondAriaCurrent, 'true', 'Second thumbnail button must have aria-current="true" when activated via keyboard');

      // Assert main image src, alt, and decode success after thumbnail selection
      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/test-dark-cover.svg`);
      const updatedAlt = await mainImg.getAttribute('alt');
      assert.equal(updatedAlt, 'Gatefold inner photo of A Love Supreme', 'Main image alt text must update to match selected thumbnail');

      // Now click third thumbnail (broken seller photo) to verify re-armed fallback triggering
      await thumbBtns.nth(2).click();
      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/test-light-cover.svg`);
      assert.equal(await mainImg.getAttribute('alt'), 'Album cover artwork for A Love Supreme by John Coltrane');
      assert.equal(await page.locator('.thumbnail-btn.selected, .thumbnail-btn[aria-current="true"]').count(), 0, 'No seller thumbnail may remain selected when release artwork is displayed');

      // Selecting a valid seller photo after fallback must restore its source and selection
      await thumbBtns.nth(0).click();
      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/test-cover.webp`);
      assert.equal(await mainImg.getAttribute('alt'), 'Front sleeve photo of A Love Supreme');
      assert.equal(await thumbBtns.nth(0).getAttribute('aria-current'), 'true');

      await page.screenshot({ path: path.join(outputDir, `listing-detail-${vp.name}.png`), fullPage: true });
      await context.close();
    }

    // Case 2: Broken seller photo -> VALID release artwork -> successful load path
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      await page.goto(`http://localhost:${port}/listings/${lst2.id}`, { waitUntil: 'domcontentloaded' });
      const mainImg = page.locator('#main-photo-img');

      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/test-light-cover.svg`);
      assert.equal(await mainImg.getAttribute('alt'), 'Album cover artwork for Giant Steps by John Coltrane', 'Fallback must reset alt text to the default');

      await context.close();
    }

    // Case 3: Broken seller photo -> BROKEN release artwork -> placeholder fallback path
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      await page.goto(`http://localhost:${port}/listings/${lst3.id}`, { waitUntil: 'domcontentloaded' });
      const mainImg = page.locator('#main-photo-img');

      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/vinyl-placeholder.svg`);
      assert.equal(await mainImg.getAttribute('alt'), 'Album cover artwork for Blue Train by John Coltrane', 'Fallback must reset alt text to the default');
      assert.equal(await page.locator('.thumbnail-btn.selected, .thumbnail-btn[aria-current="true"]').count(), 0);

      // The placeholder disables onerror; selecting another photo must re-arm it.
      await page.locator('.thumbnail-btn').nth(1).click();
      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/test-cover.webp`);
      assert.equal(await mainImg.getAttribute('alt'), 'Working photo on Blue Train');
      assert.equal(await page.locator('.thumbnail-btn').nth(1).getAttribute('aria-current'), 'true');
      await page.locator('.thumbnail-btn').nth(0).click();
      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/vinyl-placeholder.svg`);
      assert.equal(await mainImg.getAttribute('alt'), 'Album cover artwork for Blue Train by John Coltrane');
      assert.equal(await page.locator('.thumbnail-btn.selected, .thumbnail-btn[aria-current="true"]').count(), 0);

      await page.screenshot({ path: path.join(outputDir, 'broken-photo-fallback-verification.png'), fullPage: true });
      await context.close();
    }

    // Case 4: No seller photo + BROKEN release artwork -> placeholder fallback path
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      await page.goto(`http://localhost:${port}/listings/${lst4.id}`, { waitUntil: 'domcontentloaded' });
      const mainImg = page.locator('#main-photo-img');

      await assertLoadedImage(mainImg, `http://localhost:${port}/assets/vinyl-placeholder.svg`);
      assert.equal(await mainImg.getAttribute('alt'), 'Album cover artwork for My Favorite Things by John Coltrane');

      await context.close();
    }

    await browser.close();
    server.close();
    console.log('Successfully generated all Issue #65 evidence screenshots and verified all assertions cleanly!');
    process.exit(0);
  });
}

run().catch((err) => {
  console.error('Evidence generator failed:', err);
  process.exit(1);
});
