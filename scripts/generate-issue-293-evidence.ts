/// <reference lib="dom" />
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { AddressInfo, Server } from 'node:net';
import ejs from 'ejs';
import { chromium, type Browser } from '@playwright/test';
import { getIconSvg } from '../src/app/utils/iconRegistry';
import { VINYL_FORMAT_FILTERS } from '../src/domain/releaseFormat';
import { readFullStylesheetSource } from '../test/stylesheetTestHelper';

const root = process.cwd();
const views = path.join(root, 'views');
const publicDirectory = path.join(root, 'public');
const evidenceDirectory = process.env.BROWSE_EVIDENCE_DIR?.trim() || 'artifacts/issue-293';
const stylesheet = readFullStylesheetSource();

/** Renders the Browse template with production styles and representative listing fixtures. */
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

/** Renders the combined Dig surface so desktop toolbar geometry is checked in its real EJS context. */
async function renderDig(baseUrl: string): Promise<string> {
  const listings = [
    {
      id: 'dig-evidence-1', title: '3 Feet High and Rising', artist: 'De La Soul',
      releaseYear: 1989, format: 'LP', sellerUsername: 'crate_digger',
      sellerLocation: 'Amsterdam Oost', imageUrl: '/assets/vinyl-placeholder.svg',
      priceFormatted: '€25.00', mediaCondition: 'VG+', sleeveCondition: 'VG',
      url: '/listings/dig-evidence-1',
    },
    {
      id: 'dig-evidence-2', title: 'The Low End Theory', artist: 'A Tribe Called Quest',
      releaseYear: 1991, format: 'LP', sellerUsername: 'recordfan',
      sellerLocation: 'Utrecht', imageUrl: '/assets/vinyl-placeholder.svg',
      priceFormatted: '€18.50', mediaCondition: 'NM', sleeveCondition: 'VG+',
      url: '/listings/dig-evidence-2',
    },
    {
      id: 'dig-evidence-3', title: 'Midnight Marauders', artist: 'A Tribe Called Quest',
      releaseYear: 1993, format: '12-inch', sellerUsername: 'vinylhead',
      sellerLocation: 'Rotterdam', imageUrl: '/assets/vinyl-placeholder.svg',
      priceFormatted: '€32.00', mediaCondition: 'VG+', sleeveCondition: 'VG+',
      url: '/listings/dig-evidence-3',
    },
  ];
  const items = listings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    artist: listing.artist,
    releaseYear: listing.releaseYear,
    format: listing.format,
    priceFormatted: listing.priceFormatted,
    isTrade: false,
    mediaCondition: listing.mediaCondition,
    sleeveCondition: listing.sleeveCondition,
    sellerUsername: listing.sellerUsername,
    sellerLocation: listing.sellerLocation,
    url: listing.url,
    frontArtwork: {
      src: '/assets/vinyl-placeholder.svg',
      altText: 'Catalogue artwork for ' + listing.title,
      sourceLabel: 'Discogs catalogue artwork',
      sourceKind: 'catalogue_artwork',
    },
    backArtwork: null,
    conditionSummary: 'Media ' + listing.mediaCondition + ' · sleeve ' + listing.sleeveCondition,
  }));

  const body = await ejs.renderFile(path.join(views, 'browse/responsive-dig.ejs'), {
    getIconSvg,
    title: 'Dig — The Vinyl Drop',
    listings,
    items,
    totalCount: 25,
    hasMore: false,
    filters: {
      q: 'De La Soul',
      genre: 'Hip Hop',
      condition: 'VG+',
      minPrice: '10',
      maxPrice: '50',
      sort: 'price_asc',
      view: 'grid',
      formats: ['lp', '7-inch'],
      whiteLabel: false,
    },
    pagination: { totalCount: 25, page: 2, limit: 12, totalPages: 3 },
    formatOptions: VINYL_FORMAT_FILTERS,
    genreOptions: ['Hip Hop', 'Jazz'],
    whiteLabelAvailable: true,
    errorMessage: null,
  }, { filename: path.join(views, 'browse/responsive-dig.ejs') });

  return '<!doctype html><html lang="en"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<base href="' + baseUrl + '/"><link rel="stylesheet" href="' + baseUrl + '/fonts/fonts.css">' +
    '<style>' + stylesheet + '</style></head><body>' +
    '<main class="main-content container">' + body + '</main></body></html>';
}

/** Validates Browse layout and keyboard access, then captures the configured viewport screenshots. */
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
  let browser: Browser | undefined;
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
    browser = await chromium.launch({ headless: true });
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

        const locationLayouts = await page.locator('.listing-grid .listing-card-location').evaluateAll((elements) =>
          elements.map((element) => {
            const label = element.querySelector('.listing-card-location-name');
            if (!(label instanceof HTMLElement)) {
              return { text: '', clientWidth: 0, scrollWidth: Number.POSITIVE_INFINITY, clientHeight: 0, scrollHeight: Number.POSITIVE_INFINITY, lineHeight: Number.POSITIVE_INFINITY };
            }
            return {
              text: label.textContent?.trim() || '',
              clientWidth: label.clientWidth,
              scrollWidth: label.scrollWidth,
              clientHeight: label.clientHeight,
              scrollHeight: label.scrollHeight,
              lineHeight: Number.parseFloat(getComputedStyle(label).lineHeight),
            };
          })
        );
        assert.ok(locationLayouts.length > 0, 'Listing cards should expose seller locations at ' + viewport.width + 'px');
        for (const location of locationLayouts) {
          assert.ok(location.clientWidth > 0, 'Listing location has no visible width at ' + viewport.width + 'px');
          assert.ok(
            location.scrollWidth <= location.clientWidth + 1 &&
              location.scrollHeight <= location.clientHeight + 1,
            'Listing location text is clipped at ' + viewport.width + 'px: ' + location.text
          );
          if (viewport.width >= 1280 && location.text === 'Amsterdam Oost') {
            assert.ok(
              location.clientHeight <= location.lineHeight + 1,
              'A normal city location should remain on one line at ' + viewport.width + 'px'
            );
          }
        }

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

    const digHtml = await renderDig(baseUrl);
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      try {
        await page.setContent(digHtml, { waitUntil: 'load', timeout: 15000 });

        if (viewport.width <= 430) {
          const crateImage = page.locator('[data-dig-crate-source] img');
          assert.equal(
            await crateImage.isVisible(),
            true,
            'Mobile Dig crate artwork must be visible at ' + viewport.width + 'px'
          );
          const crateImageLoaded = await crateImage.evaluate((element) =>
            (element as HTMLImageElement).naturalWidth > 0
          );
          assert.equal(
            crateImageLoaded,
            true,
            'Mobile Dig crate artwork must load at ' + viewport.width + 'px'
          );
        }

        await page.locator('.browse-mobile-filter-panel').evaluate((element) => {
          (element as HTMLDetailsElement).open = true;
        });
        await page.locator('.browse-secondary-filters').evaluate((element) => {
          (element as HTMLDetailsElement).open = true;
        });

        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        assert.ok(
          dimensions.document <= viewport.width + 1 && dimensions.body <= viewport.width + 1,
          'Dig at ' + viewport.width + 'px overflows horizontally (document ' +
            dimensions.document + 'px, body ' + dimensions.body + 'px)'
        );

        if (viewport.width >= 768) {
          // Keep this callback free of nested named closures: tsx/esbuild can inject
          // a __name helper that does not exist when Playwright serializes it in-page.
          const metrics = await page.evaluate(() => {
            const searchElement = document.querySelector('#dig-primary-search');
            const submitElement = document.querySelector('.dig-primary-search-form > button[type="submit"]');
            const viewElement = document.querySelector('.dig-search-control-bar > .view-mode-toggle');
            const formatElement = document.querySelector('.dig-responsive-desktop .browse-format-chip');
            const genreElement = document.querySelector('.dig-responsive-desktop #filter-genre');
            const conditionElement = document.querySelector('.dig-responsive-desktop #filter-condition');
            const sortElement = document.querySelector('.dig-responsive-desktop #filter-sort');
            if (
              !searchElement || !submitElement || !viewElement || !formatElement ||
              !genreElement || !conditionElement || !sortElement
            ) {
              throw new Error('Missing one or more desktop Dig controls');
            }

            const searchBounds = searchElement.getBoundingClientRect();
            const submitBounds = submitElement.getBoundingClientRect();
            const viewBounds = viewElement.getBoundingClientRect();
            const actions: number[] = [];
            const actionElements = document.querySelectorAll(
              '.dig-responsive-desktop .browse-filter-action-buttons .btn'
            );
            for (let index = 0; index < actionElements.length; index += 1) {
              actions.push(actionElements[index].getBoundingClientRect().height);
            }

            return {
              search: { height: searchBounds.height, centerY: searchBounds.top + searchBounds.height / 2 },
              submit: { height: submitBounds.height, centerY: submitBounds.top + submitBounds.height / 2 },
              view: { height: viewBounds.height, centerY: viewBounds.top + viewBounds.height / 2 },
              format: formatElement.getBoundingClientRect().height,
              genre: genreElement.getBoundingClientRect().height,
              condition: conditionElement.getBoundingClientRect().height,
              sort: sortElement.getBoundingClientRect().height,
              actions,
            };
          });
          assert.deepEqual(
            [metrics.search.height, metrics.submit.height, metrics.view.height],
            [44, 44, 44],
            'Desktop Dig search, Search action and Grid/List switch must share a 44px outer height at ' +
              viewport.width + 'px'
          );
          const centers = [metrics.search.centerY, metrics.submit.centerY, metrics.view.centerY];
          assert.ok(
            Math.max(...centers) - Math.min(...centers) <= 1,
            'Desktop Dig toolbar controls are not vertically aligned at ' + viewport.width + 'px'
          );
          assert.equal(metrics.format, 44, 'Format filter height mismatch at ' + viewport.width + 'px');
          assert.equal(metrics.genre, 44, 'Genre control height mismatch at ' + viewport.width + 'px');
          assert.equal(metrics.condition, 44, 'Condition control height mismatch at ' + viewport.width + 'px');
          assert.equal(metrics.sort, 44, 'Sort control height mismatch at ' + viewport.width + 'px');
          assert.ok(
            metrics.actions.length > 0 && metrics.actions.every((height) => height === 44),
            'Filter action heights are not consistently 44px at ' + viewport.width + 'px'
          );
        }

        const screenshotPath = path.resolve(evidencePath, 'dig-' + viewport.width + 'px.png');
        await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
        console.log('[browse-evidence] PASS Dig @ ' + viewport.width + 'px — no horizontal overflow' +
          (viewport.width >= 768 ? ', toolbar and filter controls aligned' : ', mobile crate preserved'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        console.error('[browse-evidence] FAIL Dig @ ' + viewport.width + 'px: ' + message);
      } finally {
        await page.close();
      }
    }

    assert.equal(failures.length, 0, failures.join('\n'));
    console.log('[browse-evidence] Captured ' + viewports.length + ' Browse and Dig screenshots in ' + evidencePath);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

run().catch((error) => {
  console.error('[browse-evidence] Browser verification failed:', error);
  process.exitCode = 1;
});
