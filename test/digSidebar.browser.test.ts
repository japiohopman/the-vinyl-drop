import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../src/app';
import * as listingService from '../src/app/services/listingService';

jest.mock('../src/app/services/listingService', () => ({
  ...jest.requireActual('../src/app/services/listingService'),
  hasExplicitWhiteLabelInventory: jest.fn(),
  searchBrowseListings: jest.fn(),
  searchDigListings: jest.fn(),
}));


jest.setTimeout(120_000);

describe('Records-only Dig sidebar & first-load browser behavior (Issue #404)', () => {
  let server: Server;
  let baseUrl: string;
  let browser: Browser;

  const sampleHouseRecord = {
    id: 'listing-house-1',
    title: 'Can You Feel It',
    artist: 'Mr. Fingers',
    releaseYear: 1986,
    format: '12-inch',
    priceFormatted: '€28.00',
    isTrade: false,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
    sellerUsername: 'larry_heard',
    sellerLocation: 'Chicago',
    url: '/listings/listing-house-1',
    imageUrl: '/assets/vinyl-placeholder.svg',
    frontArtwork: {
      src: '/assets/vinyl-placeholder.svg',
      altText: 'Can You Feel It front',
      sourceLabel: 'Placeholder',
      sourceKind: 'placeholder',
    },
    backArtwork: null,
    conditionSummary: 'Media VG+ · Sleeve VG',
  };

  beforeAll(async () => {
    (listingService.hasExplicitWhiteLabelInventory as jest.Mock).mockResolvedValue(true);
    (listingService.searchDigListings as jest.Mock).mockResolvedValue({
      items: [sampleHouseRecord],
      totalCount: 1,
      hasMore: false,
    });
    (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
      items: [sampleHouseRecord],
      totalCount: 1,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
    const app = createApp();
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('renders cold first visit correctly without horizontal overflow or duplicate controls across all required viewports', async () => {
    const viewports = [360, 390, 430, 768, 1024, 1280, 1440];
    const context = await browser.newContext({ serviceWorkers: 'block' });

    try {
      for (const width of viewports) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });

        // Cold load with cache disabled
        await page.route('**/*', (route) => route.continue());
        await page.goto(`${baseUrl}/dig`, { waitUntil: 'domcontentloaded' });

        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          docWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }));

        expect(dimensions.viewport).toBe(width);
        expect(dimensions.docWidth).toBeLessThanOrEqual(width);
        expect(dimensions.bodyWidth).toBeLessThanOrEqual(width);

        const sidebar = page.locator('.dig-sidebar');
        const drawerTrigger = width < 768
          ? page.locator('.dig-crate-toolbar [data-dig-drawer-open]')
          : page.locator('.dig-search-control-bar [data-dig-drawer-open]');

        if (width < 768) {
          // Active mobile crate sessions keep search inside the shared filter drawer.
          expect(await page.locator('#dig-primary-search').isVisible()).toBe(false);
          expect(await page.locator('.view-mode-toggle').isVisible()).toBe(false);
          expect(await page.locator('.dig-crate-toolbar').isVisible()).toBe(true);
        } else {
          expect(await page.locator('#dig-primary-search').isVisible()).toBe(true);
          expect(await page.locator('.view-mode-toggle').isVisible()).toBe(true);
        }

        if (width >= 1024) {
          // Desktop widths keep a permanent left-hand rail beside the records.
          expect(await sidebar.isVisible()).toBe(true);
          expect(await drawerTrigger.isVisible()).toBe(false);
          const sidebarBox = await sidebar.boundingBox();
          const resultsBox = await page.locator('.dig-results-content').boundingBox();
          const sidebarMetrics = await sidebar.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);
            return {
              bottom: bounds.bottom,
              overflowY: styles.overflowY,
              clientHeight: element.clientHeight,
              viewportHeight: window.innerHeight,
            };
          });
          expect(sidebarBox).not.toBeNull();
          expect(resultsBox).not.toBeNull();
          if (sidebarBox && resultsBox) expect(sidebarBox.x).toBeLessThan(resultsBox.x);
          expect(sidebarMetrics.overflowY).toBe('auto');
          expect(sidebarMetrics.bottom).toBeLessThanOrEqual(sidebarMetrics.viewportHeight + 1);
          expect(sidebarMetrics.clientHeight).toBeLessThanOrEqual(sidebarMetrics.viewportHeight);

          // A long desktop rail must scroll its own contents rather than extend below the viewport.
          const sidebarScroll = await sidebar.evaluate((element) => ({
            before: element.scrollTop,
            contentHeight: element.scrollHeight,
            viewportHeight: element.clientHeight,
          }));
          expect(sidebarScroll.contentHeight).toBeGreaterThan(sidebarScroll.viewportHeight);
          await sidebar.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          expect(await sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(sidebarScroll.before);
          await sidebar.evaluate((element) => {
            element.scrollTop = 0;
          });
        } else {
          // Phones and tablet use the same accessible Records filter drawer.
          expect(await sidebar.isVisible()).toBe(false);
          expect(await drawerTrigger.isVisible()).toBe(true);
          await drawerTrigger.click();
          expect(await sidebar.isVisible()).toBe(true);
          expect(await sidebar.getAttribute('role')).toBe('dialog');
          expect(await sidebar.getAttribute('aria-modal')).toBe('true');
          expect(await sidebar.locator('.dig-filter-form').isVisible()).toBe(true);
          expect(await sidebar.locator('#dig-filter-query').isVisible()).toBe(width < 768);
          expect(await page.locator('[data-dig-filter-dialog]').count()).toBe(0);
          await page.keyboard.press('Escape');
          expect(await sidebar.isVisible()).toBe(false);
        }

        if (width < 768) {
          expect(await page.locator('.dig-responsive-mobile').isVisible()).toBe(true);
        } else {
          expect(await page.locator('.dig-responsive-mobile').isVisible()).toBe(false);
        }

        await page.close();
      }
    } finally {
      await context.close();
    }
  });

  it('keeps the Records filter drawer usable when its enhancement script is unavailable', async () => {
    for (const width of [390, 768]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/js/dig-sidebar.js', (route) => route.abort());
      await page.goto(baseUrl + '/dig', { waitUntil: 'domcontentloaded' });

      const sidebar = page.locator('[data-dig-sidebar]');
      expect(await sidebar.isVisible()).toBe(true);
      expect(await sidebar.getAttribute('aria-label')).toBe('Dig sidebar');
      expect(await sidebar.getAttribute('role')).toBeNull();
      expect(await sidebar.locator('.dig-filter-form').isVisible()).toBe(true);
      expect(await sidebar.locator('.dig-sidebar-tabs').count()).toBe(0);
      expect(await page.locator('a[href="/people"]').count()).toBe(0);
      expect(await page.locator('html').evaluate((element) =>
        element.classList.contains('dig-sidebar-enhanced')
      )).toBe(false);
      expect(await sidebar.locator('#dig-filter-query').isVisible()).toBe(width < 768);
      await page.close();
    }
  });

  it('manages drawer open, close, and Escape key on tablet drawer (768px)', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.setViewportSize({ width: 768, height: 900 });
      await page.goto(`${baseUrl}/dig`, { waitUntil: 'domcontentloaded' });

      const trigger = page.locator('.dig-search-control-bar [data-dig-drawer-open]');
      expect(await trigger.isVisible()).toBe(true);
      expect(await page.locator('.dig-sidebar').isVisible()).toBe(false);

      // Open drawer
      await trigger.click();
      expect(await page.locator('.dig-sidebar').isVisible()).toBe(true);
      expect(await page.locator('.dig-drawer-backdrop').isVisible()).toBe(true);

      // Close on Escape
      await page.keyboard.press('Escape');
      expect(await page.locator('.dig-sidebar').isVisible()).toBe(false);
    } finally {
      await context.close();
    }
  });
});
