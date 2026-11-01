/// <reference lib="dom" />
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { AddressInfo, Server } from 'node:net';
import ejs from 'ejs';
import { chromium } from '@playwright/test';
import { getIconSvg } from '../src/app/utils/iconRegistry';
import { VINYL_FORMAT_FILTERS } from '../src/domain/releaseFormat';
import { readFullStylesheetSource } from '../test/stylesheetTestHelper';

const root = process.cwd();
const views = path.join(root, 'views');
const publicDirectory = path.join(root, 'public');
const evidenceDirectory = process.env.BROWSE_EVIDENCE_DIR?.trim() || 'artifacts/issue-293';
const stylesheet = readFullStylesheetSource();

async function renderBrowse(baseUrl: string): Promise<string> {
  const body = await ejs.renderFile(path.join(views, 'browse/index.ejs'), {
    getIconSvg,
    title: 'Browse — The Vinyl Drop',
    listings: [
      {
        id: 'browse-evidence-1', title: '3 Feet High and Rising', artist: 'De La Soul',
        releaseYear: 1989, format: 'LP', sellerUsername: 'crate_digger',
        sellerLocation: 'Amsterdam Oost', imageUrl: '/assets/vinyl-placeholder.svg',
        priceFormatted: '€25.00', mediaCondition: 'VG+', sleeveCondition: 'VG',
        url: '/listings/browse-evidence-1',
      },
      {
        id: 'browse-evidence-2', title: 'The Low End Theory', artist: 'A Tribe Called Quest',
        releaseYear: 1991, format: 'LP', sellerUsername: 'recordfan',
        sellerLocation: 'Utrecht', imageUrl: '/assets/vinyl-placeholder.svg',
        priceFormatted: '€18.50', mediaCondition: 'NM', sleeveCondition: 'VG+',
        url: '/listings/browse-evidence-2',
      },
      {
        id: 'browse-evidence-3', title: 'Midnight Marauders', artist: 'A Tribe Called Quest',
        releaseYear: 1993, format: '12-inch', sellerUsername: 'vinylhead',
        sellerLocation: 'Rotterdam', imageUrl: '/assets/vinyl-placeholder.svg',
        priceFormatted: '€32.00', mediaCondition: 'VG+', sleeveCondition: 'VG+',
        url: '/listings/browse-evidence-3',
      },
      {
        id: 'browse-evidence-4',
        title: 'Long title fixture used to check title wrapping without clipping',
        artist: 'A Longer Artist Name for Responsive Layout Review',
        releaseYear: 1994, format: '7-inch', sellerUsername: 'longusernamefixture',
        sellerLocation: 'A location with a longer display name',
        imageUrl: '/assets/vinyl-placeholder.svg', priceFormatted: '€7.00',
        mediaCondition: 'VG', sleeveCondition: 'VG',
        url: '/listings/browse-evidence-4',
      },
    ],
    filters: {
      q: 'De La Soul', genre: 'Hip Hop', condition: 'VG+', minPrice: '10',
      maxPrice: '50', sort: 'price_asc', view: 'grid', formats: ['lp'], whiteLabel: false,
    },
    pagination: { totalCount: 25, page: 2, limit: 12, totalPages: 3 },
    formatOptions: VINYL_FORMAT_FILTERS,
    whiteLabelAvailable: true,
  }, { filename: path.join(views, 'browse/index.ejs') });

  return '<!doctype html><html lang="en"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<base href="' + baseUrl + '/"><link rel="stylesheet" href="' + baseUrl + '/fonts/fonts.css">' +
    '<style>' + stylesheet + '</style></head><body>' +
    '<main class="main-content container">' + body + '</main></body></html>';
}

async function run(): Promise<void> {
  const evidencePath = path.resolve(root, evidenceDirectory);
  fs.mkdirSync(evidencePath, { recursive: true });

  const staticApp = express();
  staticApp.use(express.static(publicDirectory));
  const server: Server = staticApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = 'http://127.0.0.1:' + address.port;
  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];
  const viewports = [
    { width: 360, height: 800, minimumColumns: 1 },
    { width: 430, height: 932, minimumColumns: 1 },
    { width: 768, height: 1024, minimumColumns: 2 },
    { width: 1024, height: 900, minimumColumns: 3 },
    { width: 1280, height: 900, minimumColumns: 4 },
    { width: 1440, height: 1000, minimumColumns: 4 },
  ];

  try {
    const html = await renderBrowse(baseUrl);
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      try {
        await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
        await page.locator('.browse-mobile-filter-panel').evaluate((element) => {
          (element as HTMLDetailsElement).open = true;
        });

        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        assert.equal(dimensions.viewport, viewport.width);
        assert.ok(
          dimensions.document <= viewport.width + 1 && dimensions.body <= viewport.width + 1,
          'Browse at ' + viewport.width + 'px overflows horizontally (document ' +
            dimensions.document + 'px, body ' + dimensions.body + 'px)'
        );

        const search = page.locator('#search-q');
        assert.ok(await search.isVisible(), 'Browse search should be visible at ' + viewport.width + 'px');
        const searchState = await search.evaluate((element) => {
          const input = element as HTMLInputElement;
          const style = getComputedStyle(input);
          return {
            height: input.getBoundingClientRect().height,
            paddingLeft: parseFloat(style.paddingLeft),
            accessibleName: Array.from(input.labels || []).some((label) => Boolean(label.textContent?.trim())),
          };
        });
        assert.ok(searchState.height >= 44, 'Search control is too short at ' + viewport.width + 'px');
        assert.ok(searchState.paddingLeft >= 40, 'Search text collides with its icon at ' + viewport.width + 'px');
        assert.ok(searchState.accessibleName, 'Search has no accessible label at ' + viewport.width + 'px');

        let reachedByKeyboard = false;
        for (let tab = 0; tab < 60; tab += 1) {
          await page.keyboard.press('Tab');
          if (await search.evaluate((element) => element === document.activeElement)) {
            reachedByKeyboard = true;
            break;
          }
        }
        assert.ok(reachedByKeyboard, 'Search is not reachable by keyboard at ' + viewport.width + 'px');
        const focusOutline = await search.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth));
        assert.ok(focusOutline >= 3, 'Search has no visible keyboard focus at ' + viewport.width + 'px');

        const chipHeight = await page.locator('.browse-format-chip').first()
          .evaluate((element) => element.getBoundingClientRect().height);
        assert.ok(chipHeight >= 44, 'Format filter target is too small at ' + viewport.width + 'px');

        const cardColumns = await page.locator('.listing-grid').evaluate((element) => {
          const template = getComputedStyle(element).gridTemplateColumns;
          return template.split(' ').filter(Boolean).length;
        });
        assert.ok(
          cardColumns >= viewport.minimumColumns,
          'Expected at least ' + viewport.minimumColumns + ' card columns at ' +
            viewport.width + 'px, got ' + cardColumns
        );

        const screenshotPath = path.resolve(evidencePath, 'browse-' + viewport.width + 'px.png');
        await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
        console.log('[browse-evidence] PASS Browse @ ' + viewport.width + 'px — ' +
          cardColumns + ' columns, no horizontal overflow');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        console.error('[browse-evidence] FAIL Browse @ ' + viewport.width + 'px: ' + message);
      } finally {
        await page.close();
      }
    }

    assert.equal(failures.length, 0, failures.join('\n'));
    console.log('[browse-evidence] Captured ' + viewports.length + ' Browse screenshots in ' + evidencePath);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

run().catch((error) => {
  console.error('[browse-evidence] Browser verification failed:', error);
  process.exitCode = 1;
});
