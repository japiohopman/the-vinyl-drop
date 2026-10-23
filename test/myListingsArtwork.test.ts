/// <reference lib="dom" />

import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import path from 'path';
import ejs from 'ejs';

jest.setTimeout(45000);

describe('My Listings Artwork Thumbnails (#146)', () => {
  const viewPath = path.join(process.cwd(), 'views/listings/index.ejs');

  describe('View Rendering & Image Fallback Hierarchy', () => {
    it('prefers usable seller-uploaded photo over release artwork', async () => {
      const mockListings = [
        {
          id: 'listing-seller-photo',
          status: 'published',
          tradeAvailable: false,
          priceFormatted: '€25.00',
          release: {
            title: 'Blue Train',
            artist: 'John Coltrane',
            releaseYear: 1957,
            coverArtUrl: 'https://catalog.example/coltrane-catalog.jpg',
          },
          physicalCopy: {
            mediaCondition: 'NM',
            sleeveCondition: 'VG+',
          },
          photos: [
            {
              publicUrl: 'https://storage.example/seller-photo-1.jpg',
              altText: 'Custom physical sleeve photo',
            },
          ],
        },
      ];

      const html = await ejs.renderFile(viewPath, {
        listings: mockListings,
        viewHidden: false,
      });

      expect(html).toContain('class="my-listings-thumbnail-frame"');
      expect(html).toContain('class="my-listings-thumbnail-img"');
      expect(html).toContain('src="https://storage.example/seller-photo-1.jpg"');
      expect(html).toContain('alt="Custom physical sleeve photo"');
      expect(html).toContain('data-secondary-src="https://catalog.example/coltrane-catalog.jpg"');
      expect(html).toContain('data-secondary-alt="Catalog cover artwork for Blue Train"');
      expect(html).toContain('data-placeholder="/assets/vinyl-placeholder.svg"');
    });

    it('falls back to release coverArtUrl when no seller photo is available', async () => {
      const mockListings = [
        {
          id: 'listing-catalog-only',
          status: 'draft',
          tradeAvailable: true,
          priceFormatted: '€30.00',
          release: {
            title: 'A Love Supreme',
            artist: 'John Coltrane',
            releaseYear: 1965,
            coverArtUrl: 'https://catalog.example/a-love-supreme.jpg',
          },
          physicalCopy: {
            mediaCondition: 'VG+',
            sleeveCondition: 'VG',
          },
          photos: [],
        },
      ];

      const html = await ejs.renderFile(viewPath, {
        listings: mockListings,
        viewHidden: false,
      });

      expect(html).toContain('src="https://catalog.example/a-love-supreme.jpg"');
      expect(html).toContain('alt="Catalog cover artwork for A Love Supreme"');
      expect(html).toContain('data-secondary-src="/assets/vinyl-placeholder.svg"');
      expect(html).toContain('data-secondary-alt="Default vinyl placeholder for A Love Supreme"');
    });

    it('falls back to local placeholder when neither seller photo nor release artwork exists', async () => {
      const mockListings = [
        {
          id: 'listing-no-art',
          status: 'published',
          tradeAvailable: false,
          priceFormatted: '€15.00',
          release: {
            title: 'Unknown Test Pressing',
            artist: 'Anonymous',
            releaseYear: null,
            coverArtUrl: null,
          },
          physicalCopy: {
            mediaCondition: 'G+',
            sleeveCondition: 'G',
          },
          photos: [],
        },
      ];

      const html = await ejs.renderFile(viewPath, {
        listings: mockListings,
        viewHidden: false,
      });

      expect(html).toContain('src="/assets/vinyl-placeholder.svg"');
      expect(html).toContain('alt="Default vinyl placeholder for Unknown Test Pressing"');
      expect(html).toContain('data-secondary-src=""');
    });

    it('preserves existing action controls and status behavior across drafts and terminal statuses', async () => {
      const mockListings = [
        {
          id: 'listing-draft',
          status: 'draft',
          tradeAvailable: false,
          priceFormatted: '€20.00',
          release: { title: 'Draft Album', artist: 'Artist A', releaseYear: 2020, coverArtUrl: null },
          physicalCopy: { mediaCondition: 'NM', sleeveCondition: 'NM' },
          photos: [],
        },
        {
          id: 'listing-published',
          status: 'published',
          tradeAvailable: false,
          priceFormatted: '€25.00',
          release: { title: 'Published Album', artist: 'Artist B', releaseYear: 2021, coverArtUrl: null },
          physicalCopy: { mediaCondition: 'VG+', sleeveCondition: 'VG+' },
          photos: [],
        },
        {
          id: 'listing-sold',
          status: 'sold',
          tradeAvailable: false,
          priceFormatted: '€35.00',
          release: { title: 'Sold Album', artist: 'Artist C', releaseYear: 2022, coverArtUrl: null },
          physicalCopy: { mediaCondition: 'VG', sleeveCondition: 'VG' },
          photos: [],
        },
      ];

      const html = await ejs.renderFile(viewPath, {
        listings: mockListings,
        viewHidden: false,
      });

      expect(html).toContain('action="/listings/listing-draft/publish"');
      expect(html).toContain('action="/listings/listing-published/unpublish"');
      expect(html).toContain('action="/listings/listing-sold/dismiss"');
      expect(html).toContain('href="/listings/listing-draft/preview"');
      expect(html).toContain('href="/listings/listing-draft/edit"');
      expect(html).not.toContain('href="/listings/listing-sold/edit"');
    });
  });

  describe('Browser Responsive & Interactive Fallback Behavior (Playwright)', () => {
    let browser: Browser;
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      browser = await chromium.launch({ headless: true });

      const app = express();
      app.set('views', path.join(process.cwd(), 'views'));
      app.set('view engine', 'ejs');
      app.use(express.static(path.join(process.cwd(), 'public')));

      const sampleListings = [
        {
          id: 'test-1',
          status: 'published',
          tradeAvailable: true,
          priceFormatted: '€45.00',
          release: {
            title: 'Head Hunters',
            artist: 'Herbie Hancock',
            releaseYear: 1973,
            coverArtUrl: 'https://catalog.invalid/head-hunters.jpg',
          },
          physicalCopy: {
            mediaCondition: 'VG+',
            sleeveCondition: 'VG',
          },
          photos: [
            {
              publicUrl: 'https://broken-seller-storage.invalid/seller-shot.jpg',
              altText: 'Original 1973 sleeve',
            },
          ],
        },
        {
          id: 'test-2',
          status: 'draft',
          tradeAvailable: false,
          priceFormatted: '€18.00',
          release: {
            title: 'Thrust',
            artist: 'Herbie Hancock',
            releaseYear: 1974,
            coverArtUrl: null,
          },
          physicalCopy: {
            mediaCondition: 'NM',
            sleeveCondition: 'VG+',
          },
          photos: [],
        },
      ];

      app.get('/test/my-listings', (_req, res, next) => {
        res.render('listings/index', {
          listings: sampleListings,
          viewHidden: false,
        }, (error, bodyHtml) => {
          if (error) return next(error);

          // This is a standalone view in production layout, so include the real
          // global stylesheet and page shell in browser tests rather than testing
          // intrinsic image dimensions without the thumbnail-frame CSS.
          return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main class="main-content container">${bodyHtml}</main>
</body>
</html>`);
        });
      });

      server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (browser) {
        await browser.close();
      }
    });

    const viewports = [
      { width: 360, height: 740, name: '360px Small Mobile' },
      { width: 390, height: 844, name: '390px Mobile' },
      { width: 768, height: 1024, name: '768px Tablet' },
      { width: 1280, height: 800, name: '1280px Desktop' },
    ];

    for (const vp of viewports) {
      it(`renders My Listings without page-level horizontal overflow at ${vp.name} (${vp.width}px)`, async () => {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`${baseUrl}/test/my-listings`);

        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.scrollingElement
            ? document.scrollingElement.scrollWidth > window.innerWidth
            : false;
        });

        expect(hasHorizontalOverflow).toBe(false);

        const thumbnail = page.locator('.my-listings-thumbnail-frame').first();
        expect(await thumbnail.isVisible()).toBe(true);

        const box = await thumbnail.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }

        await page.close();
      });
    }

    it('cascades fallback from broken seller photo to catalog artwork and terminal fallback on error', async () => {
      const page = await browser.newPage();

      // Intercept seller photo to fail immediately, and catalog artwork to succeed initially
      await page.route('**/seller-shot.jpg', (route) => route.abort());
      await page.route('**/head-hunters.jpg', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        });
      });

      await page.goto(`${baseUrl}/test/my-listings`);

      const img = page.locator('.my-listings-thumbnail-img').first();
      await img.waitFor({ state: 'visible', timeout: 5000 });

      // Verify that broken seller photo automatically fell back to catalog artwork with updated alt
      await page.waitForFunction(() => {
        const el = document.querySelector('.my-listings-thumbnail-img') as HTMLImageElement;
        return el && el.src.includes('head-hunters.jpg');
      });

      const secondarySrc = await img.getAttribute('src');
      const secondaryAlt = await img.getAttribute('alt');
      expect(secondarySrc).toBe('https://catalog.invalid/head-hunters.jpg');
      expect(secondaryAlt).toBe('Catalog cover artwork for Head Hunters');

      // Now trigger error on catalog artwork -> transitions to local placeholder
      await page.evaluate(() => {
        const el = document.querySelector('.my-listings-thumbnail-img') as HTMLImageElement;
        el.dispatchEvent(new Event('error'));
      });

      await page.waitForFunction(() => {
        const el = document.querySelector('.my-listings-thumbnail-img') as HTMLImageElement;
        return el && el.src.includes('vinyl-placeholder.svg');
      });

      const placeholderSrc = await img.getAttribute('src');
      const placeholderAlt = await img.getAttribute('alt');
      expect(placeholderSrc).toBe('/assets/vinyl-placeholder.svg');
      expect(placeholderAlt).toBe('Default vinyl placeholder for Head Hunters');

      // Trigger third error on local placeholder -> renders terminal fallback badge
      await page.evaluate(() => {
        const el = document.querySelector('.my-listings-thumbnail-img') as HTMLImageElement;
        el.dispatchEvent(new Event('error'));
      });

      const terminalBadge = page.locator('.my-listings-terminal-fallback').first();
      expect(await terminalBadge.isVisible()).toBe(true);
      expect(await terminalBadge.getAttribute('role')).toBe('img');
      expect(await terminalBadge.getAttribute('aria-label')).toBe('Default vinyl placeholder for Head Hunters');

      await page.close();
    });
  });
});
