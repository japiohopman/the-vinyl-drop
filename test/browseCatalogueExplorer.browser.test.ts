import { Browser, chromium } from '@playwright/test';
import { Server } from 'http';
import { createApp } from '../src/app';
import * as listingService from '../src/app/services/listingService';

jest.mock('../src/app/services/listingService', () => ({
  ...jest.requireActual('../src/app/services/listingService'),
  hasExplicitWhiteLabelInventory: jest.fn(),
  searchBrowseListings: jest.fn(),
}));

jest.setTimeout(120_000);

describe('Desktop Browse Catalogue Explorer — browser behavior', () => {
  let server: Server;
  let baseUrl: string;
  let browser!: Browser;

  beforeAll(async () => {
    (listingService.hasExplicitWhiteLabelInventory as jest.Mock).mockResolvedValue(true);
    (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'browse-explorer-one',
          title: '3 Feet High and Rising',
          artist: 'De La Soul',
          releaseYear: 1989,
          format: 'LP',
          priceFormatted: '€25.00',
          isTrade: false,
          mediaCondition: 'VG+',
          sleeveCondition: 'VG',
          sellerUsername: 'crate_digger',
          sellerLocation: 'Amsterdam Oost',
          imageUrl: '/assets/vinyl-placeholder.svg',
          url: '/listings/browse-explorer-one',
        },
        {
          id: 'browse-explorer-two',
          title: 'The Low End Theory',
          artist: 'A Tribe Called Quest',
          releaseYear: 1991,
          format: 'LP',
          priceFormatted: '€30.00',
          isTrade: false,
          mediaCondition: 'VG',
          sleeveCondition: 'VG+',
          sellerUsername: 'crate_digger',
          sellerLocation: 'Amsterdam Oost',
          imageUrl: '/assets/vinyl-placeholder.svg',
          url: '/listings/browse-explorer-two',
        },
        {
          id: 'browse-explorer-three',
          title: 'Black Sunday',
          artist: 'Cypress Hill',
          releaseYear: 1993,
          format: 'LP',
          priceFormatted: '€22.00',
          isTrade: false,
          mediaCondition: 'VG+',
          sleeveCondition: 'VG',
          sellerUsername: 'crate_digger',
          sellerLocation: 'Amsterdam Oost',
          imageUrl: '/assets/vinyl-placeholder.svg',
          url: '/listings/browse-explorer-three',
        },
      ],
      totalCount: 3,
      page: 1,
      limit: 12,
      totalPages: 1,
    });

    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the local Browse test server address.');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 120_000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }, 30_000);

  it('navigates through All records, genre replacement, format toggles and browser history', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const initialQuery = 'q=De%20La%20Soul&genre=Hip%20Hop&condition=VG%2B&minPrice=5&maxPrice=500&sort=price_asc&format=lp&format=7-inch&whiteLabel=1&view=list&page=3';

    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${baseUrl}/browse?${initialQuery}`, { waitUntil: 'domcontentloaded' });
      expect(await page.locator('.browse-catalogue-explorer').isVisible()).toBe(true);
      expect(await page.locator('[data-explorer-genre="Hip Hop"]').getAttribute('aria-current')).toBe('page');

      await page.locator('[data-explorer-all]').click();
      await page.waitForURL(/\/browse\?/);
      let current = new URL(page.url());
      expect(current.searchParams.get('q')).toBe('De La Soul');
      expect(current.searchParams.get('genre')).toBeNull();
      expect(current.searchParams.getAll('format')).toEqual([]);
      expect(current.searchParams.get('condition')).toBe('VG+');
      expect(current.searchParams.get('minPrice')).toBe('5');
      expect(current.searchParams.get('maxPrice')).toBe('500');
      expect(current.searchParams.get('sort')).toBe('price_asc');
      expect(current.searchParams.get('whiteLabel')).toBe('1');
      expect(current.searchParams.get('view')).toBe('list');
      expect(current.searchParams.get('page')).toBeNull();

      await page.goBack();
      await page.waitForURL(new RegExp(`genre=Hip%20Hop`));
      current = new URL(page.url());
      expect(current.searchParams.get('genre')).toBe('Hip Hop');
      expect(current.searchParams.getAll('format')).toEqual(['lp', '7-inch']);
      expect(current.searchParams.get('page')).toBe('3');

      await page.locator('[data-explorer-genre="Funk / Soul"]').click();
      await page.waitForURL(/genre=Funk%20%2F%20Soul/);
      current = new URL(page.url());
      expect(current.searchParams.get('genre')).toBe('Funk / Soul');
      expect(current.searchParams.getAll('format')).toEqual(['lp', '7-inch']);
      expect(current.searchParams.get('page')).toBeNull();
      expect(current.searchParams.get('q')).toBe('De La Soul');

      await page.locator('[data-explorer-format="lp"]').click();
      await page.waitForURL(/format=7-inch/);
      current = new URL(page.url());
      expect(current.searchParams.get('genre')).toBe('Funk / Soul');
      expect(current.searchParams.getAll('format')).toEqual(['7-inch']);

      await page.locator('[data-explorer-format="12-inch"]').click();
      await page.waitForURL(/format=12-inch/);
      current = new URL(page.url());
      expect(current.searchParams.get('genre')).toBe('Funk / Soul');
      expect(current.searchParams.getAll('format')).toEqual(['7-inch', '12-inch']);
    } finally {
      await context.close();
    }
  });

  it('keeps the current selection visible when the native Explorer disclosure is collapsed', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${baseUrl}/browse?genre=Funk%20%2F%20Soul&format=12-inch`, { waitUntil: 'domcontentloaded' });

      const disclosure = page.locator('.browse-explorer-disclosure');
      const summary = disclosure.locator('summary');
      const selectedState = disclosure.locator('.browse-explorer-summary-selection');
      expect(await disclosure.getAttribute('open')).not.toBeNull();
      expect(await selectedState.textContent()).toBe('Funk / Soul · 12-inch');

      await summary.click();
      expect(await disclosure.getAttribute('open')).toBeNull();
      expect(await selectedState.isVisible()).toBe(true);
      expect(await selectedState.textContent()).toBe('Funk / Soul · 12-inch');

      await summary.click();
      expect(await disclosure.getAttribute('open')).not.toBeNull();
      expect(await selectedState.textContent()).toBe('Funk / Soul · 12-inch');
    } finally {
      await context.close();
    }
  });

  it('shows the rail only at desktop widths and keeps Browse free of horizontal overflow', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}/browse`, { waitUntil: 'domcontentloaded' });
      for (const width of [360, 430, 768, 1023, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        expect(dimensions.viewport).toBe(width);
        expect(dimensions.document).toBeLessThanOrEqual(width);
        expect(dimensions.body).toBeLessThanOrEqual(width);
        expect(await page.locator('.browse-catalogue-explorer').isVisible()).toBe(width >= 1024);
        expect(await page.locator('.listing-card').count()).toBe(3);

        if (width >= 1024) {
          const grid = await page.locator('.browse-results-content .listing-grid').evaluate((element) => {
            const tracks = getComputedStyle(element).gridTemplateColumns
              .split(/\\s+/)
              .map((track) => Number.parseFloat(track));
            return {
              columns: tracks.length,
              minimumTrackWidth: Math.min(...tracks),
            };
          });
          expect(grid.columns).toBe(width >= 1280 ? 3 : 2);
          expect(grid.minimumTrackWidth).toBeGreaterThanOrEqual(248);
        }
      }
    } finally {
      await context.close();
    }
  });
});
