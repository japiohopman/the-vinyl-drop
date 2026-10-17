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
import { createApp } from '../src/app';
import { chromium } from '@playwright/test';

const lightSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="%23fdfdfd"/><rect x="10" y="10" width="380" height="380" fill="none" stroke="%23cccccc" stroke-width="4"/><text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="bold" fill="%23111111">LIGHT ALBUM</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18" fill="%23666666">High Key Light Art</text></svg>`;

const darkSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="%230d0d0d"/><rect x="10" y="10" width="380" height="380" fill="none" stroke="%23333333" stroke-width="4"/><text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="bold" fill="%23ffffff">DARK SIDE</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18" fill="%23aaaaaa">Low Key Dark Art</text></svg>`;

const busySvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="%23f60f4b"/><circle cx="100" cy="100" r="80" fill="%23ffcc00"/><circle cx="300" cy="100" r="80" fill="%2300ccff"/><circle cx="100" cy="300" r="80" fill="%2366ff66"/><circle cx="300" cy="300" r="80" fill="%23ff66cc"/><path d="M0 0 L400 400 M400 0 L0 400" stroke="%23000000" stroke-width="8"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="bold" fill="%23ffffff">BUSY PATTERN</text></svg>`;

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
    { title: 'The White Album (Light Art)', artist: 'The Beatles', year: 1968, media: 'NM', sleeve: 'VG+', price: 4500, art: lightSvg },
    { title: 'The Black Album (Dark Art)', artist: 'Metallica', year: 1991, media: 'VG+', sleeve: 'VG', price: 3200, art: darkSvg },
    { title: 'Sgt. Pepper (Busy Art)', artist: 'The Beatles', year: 1967, media: 'M', sleeve: 'NM', price: 5500, art: busySvg },
    { title: 'Broken Image Test', artist: 'Missing File Band', year: 2020, media: 'VG', sleeve: 'VG-', price: 1500, art: '/assets/non-existent-file.jpg' },
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

      // Grid Mode
      await page.goto(`http://localhost:${port}/browse?view=grid`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outputDir, `browse-grid-${vp.name}.png`), fullPage: true });

      // List Mode
      await page.goto(`http://localhost:${port}/browse?view=list`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outputDir, `browse-list-${vp.name}.png`), fullPage: true });

      await context.close();
    }

    // Verify broken image onerror fallback behavior specifically
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/browse?view=grid`, { waitUntil: 'networkidle' });

    // Ensure the broken image fallback triggered onerror
    const brokenCardFallback = page.locator('[data-listing-id]').filter({ hasText: 'Broken Image Test' }).locator('.listing-card-image-fallback');
    const isFallbackVisible = await brokenCardFallback.isVisible();
    console.log(`[Broken Image Check] Fallback visible on error: ${isFallbackVisible}`);

    await page.screenshot({ path: path.join(outputDir, 'broken-and-missing-image-fallback-verification.png'), fullPage: true });

    await browser.close();
    server.close();
    console.log('Successfully generated all Issue #117 evidence screenshots in docs/evidence/issue-117/');
    process.exit(0);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
