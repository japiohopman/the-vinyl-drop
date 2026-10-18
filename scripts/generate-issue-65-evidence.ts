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
import { chromium, Page } from '@playwright/test';

async function assertLoadedImage(page: Page, selector: string, expectedUrlSubstring: string, timeout = 5000) {
  await page.waitForFunction(
    ({ sel, sub }) => {
      const img = (globalThis as unknown as { document: { querySelector: (s: string) => { src: string; complete: boolean; naturalWidth: number } | null } }).document.querySelector(sel);
      return Boolean(img && img.src.includes(sub) && img.complete && img.naturalWidth > 0);
    },
    { sel: selector, sub: expectedUrlSubstring },
    { timeout }
  );
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

  await db.insert(listingPhotos).values({
    listingId: lst3.id,
    storagePath: 'assets/broken-photo-2.webp',
    displayOrder: 0,
    altText: 'Broken photo on Blue Train',
  });

  // 4. Listing with NO seller photo AND NO release artwork -> directly renders vinyl placeholder
  const [rel5] = await db.insert(releases).values({
    title: 'Ballads',
    artist: 'John Coltrane',
    label: 'Impulse!',
    releaseYear: 1963,
    format: 'LP',
  }).returning();

  const [pc5] = await db.insert(physicalCopies).values({
    releaseId: rel5.id,
    ownerId: sellerId,
    mediaCondition: 'NM',
    sleeveCondition: 'NM',
  }).returning();

  const [lst5] = await db.insert(listings).values({
    physicalCopyId: pc5.id,
    sellerId: sellerId,
    price: 3500,
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

      // Polling assertion for initial image load & decode
      await assertLoadedImage(page, '#main-photo-img', 'assets/test-cover.webp');

      // Verify initial main image src and alt
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

      // Polling assertion for second image load & decode after thumbnail activation
      await assertLoadedImage(page, '#main-photo-img', 'assets/test-dark-cover.svg');

      const updatedAlt = await mainImg.getAttribute('alt');
      assert.equal(updatedAlt, 'Gatefold inner photo of A Love Supreme', 'Main image alt text must update to match selected thumbnail');

      // Now click third thumbnail (broken seller photo) to verify re-armed fallback triggering
      await thumbBtns.nth(2).click();
      await assertLoadedImage(page, '#main-photo-img', 'test-light-cover.svg');

      const isThirdSelected = await thumbBtns.nth(2).evaluate((el) => el.classList.contains('selected'));
      const thirdAriaCurrent = await thumbBtns.nth(2).getAttribute('aria-current');
      assert.ok(isThirdSelected, 'Third thumbnail button must remain selected after fallback');
      assert.equal(thirdAriaCurrent, 'true', 'Third thumbnail button must keep aria-current="true" after fallback');

      await page.screenshot({ path: path.join(outputDir, `listing-detail-${vp.name}.png`), fullPage: true });
      await context.close();
    }

    // Case 2: Broken seller photo -> VALID release artwork -> successful load path
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      await page.goto(`http://localhost:${port}/listings/${lst2.id}`, { waitUntil: 'domcontentloaded' });
      await assertLoadedImage(page, '#main-photo-img', 'test-light-cover.svg');

      const mainImg = page.locator('#main-photo-img');
      const currentAlt = await mainImg.getAttribute('alt');
      assert.equal(currentAlt, 'Catalog cover artwork for Giant Steps', 'Alt text must update to release artwork alt text');

      await context.close();
    }

    // Case 3: Broken seller photo -> BROKEN release artwork -> placeholder fallback path
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      await page.goto(`http://localhost:${port}/listings/${lst3.id}`, { waitUntil: 'domcontentloaded' });
      await assertLoadedImage(page, '#main-photo-img', 'vinyl-placeholder.svg');

      const mainImg = page.locator('#main-photo-img');
      const currentAlt = await mainImg.getAttribute('alt');
      assert.equal(currentAlt, 'Default vinyl placeholder for Blue Train', 'Alt text must update to truthful vinyl placeholder alt text');

      await page.screenshot({ path: path.join(outputDir, 'broken-photo-fallback-verification.png'), fullPage: true });
      await context.close();
    }

    // Case 4: Initial no-source listing -> truthful placeholder alt text
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      await page.goto(`http://localhost:${port}/listings/${lst5.id}`, { waitUntil: 'domcontentloaded' });
      await assertLoadedImage(page, '#main-photo-img', 'vinyl-placeholder.svg');

      const mainImg = page.locator('#main-photo-img');
      const currentAlt = await mainImg.getAttribute('alt');
      assert.equal(currentAlt, 'Default vinyl placeholder for Ballads', 'Initial placeholder must have truthful placeholder alt text');

      await context.close();
    }

    // Case 5: Controlled browser test with network route interception aborting placeholder request
    // Asserts exact request count === 1, image remains on placeholder URL, and img.onerror === null
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      let placeholderRequestCount = 0;

      await context.route('**/assets/vinyl-placeholder.svg', (route) => {
        placeholderRequestCount++;
        route.abort();
      });

      const page = await context.newPage();
      await page.goto(`http://localhost:${port}/listings/${lst3.id}`, { waitUntil: 'domcontentloaded' });

      // Wait for image fallback chain to attempt loading vinyl-placeholder.svg and set onerror = null
      await page.waitForFunction(() => {
        const img = (globalThis as unknown as { document: { getElementById: (id: string) => { src: string; onerror: unknown } | null } }).document.getElementById('main-photo-img');
        return Boolean(img && img.src.includes('vinyl-placeholder.svg') && img.onerror === null);
      }, { timeout: 5000 });

      const finalSrc = await page.locator('#main-photo-img').evaluate((el) => (el as unknown as { src: string }).src);
      const finalOnerror = await page.locator('#main-photo-img').evaluate((el) => (el as unknown as { onerror: unknown }).onerror);

      assert.ok(finalSrc.includes('vinyl-placeholder.svg'), 'Image src must remain on vinyl placeholder URL after aborted request');
      assert.equal(finalOnerror, null, 'img.onerror MUST be null after fallback to placeholder completes');
      assert.equal(placeholderRequestCount, 1, 'Placeholder request count MUST be exactly 1 (no repeated requests / infinite loops)');

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
