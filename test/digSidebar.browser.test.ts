import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../src/app';
import * as listingService from '../src/app/services/listingService';
import * as peopleSearchService from '../src/app/services/peopleSearchService';

jest.mock('../src/app/services/listingService', () => ({
  ...jest.requireActual('../src/app/services/listingService'),
  hasExplicitWhiteLabelInventory: jest.fn(),
  searchBrowseListings: jest.fn(),
  searchDigListings: jest.fn(),
}));

jest.mock('../src/app/services/peopleSearchService', () => ({
  ...jest.requireActual('../src/app/services/peopleSearchService'),
  getPeopleSearchSuggestions: jest.fn(),
  searchPeople: jest.fn(),
}));

jest.setTimeout(120_000);

describe('Dig unified sidebar & first-load browser behavior (Issue #393)', () => {
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

  const samplePerson = {
    username: 'larry_heard',
    displayName: 'Larry Heard',
    avatarUrl: 'https://images.example/larry.jpg',
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
    (peopleSearchService.searchPeople as jest.Mock).mockResolvedValue({
      items: [samplePerson],
      totalCount: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      hasMore: false,
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
          // Phones and tablet use the same accessible Records/People/filter drawer.
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

  it('keeps the Records and People sidebar usable when its enhancement script is unavailable', async () => {
    for (const width of [390, 768]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/js/dig-sidebar.js', (route) => route.abort());
      await page.goto(baseUrl + '/dig', { waitUntil: 'domcontentloaded' });

      const sidebar = page.locator('[data-dig-sidebar]');
      expect(await sidebar.isVisible()).toBe(true);
      expect(await sidebar.getAttribute('aria-label')).toBe('Dig sidebar');
      expect(await sidebar.getAttribute('role')).toBeNull();
      expect(await sidebar.locator('.dig-filter-form').isVisible()).toBe(true);
      expect(await sidebar.locator('#tab-people').getAttribute('href')).toBe('/people');
      expect(await page.locator('html').evaluate((element) =>
        element.classList.contains('dig-sidebar-enhanced')
      )).toBe(false);
      expect(await sidebar.locator('#dig-filter-query').isVisible()).toBe(width < 768);
      await page.close();
    }
  });

  it('normalizes People queries like the server and counts Unicode code points', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(baseUrl + '/dig', { waitUntil: 'domcontentloaded' });
      await page.locator('#tab-people').click();

      (peopleSearchService.searchPeople as jest.Mock).mockClear();
      await page.locator('#dig-people-input').fill('ﬀ');
      await page.waitForSelector('.dig-people-card');
      expect(peopleSearchService.searchPeople).toHaveBeenCalledWith('ff', 1);
      expect(await page.locator('#dig-people-status').textContent()).toContain('Found 1 matching collector.');

      (peopleSearchService.searchPeople as jest.Mock).mockClear();
      await page.locator('#dig-people-input').fill('𝄞');
      await page.waitForFunction(() =>
        document.querySelector('#dig-people-status')?.textContent?.includes('Enter at least 2 characters') === true
      );
      expect(peopleSearchService.searchPeople).not.toHaveBeenCalled();
      expect(await page.locator('.dig-people-card').count()).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('clears stale People results immediately and ignores an older response that arrives last', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => {
      type DeferredResponse = (response: Response) => void;
      const state = window as unknown as {
        __pendingPeopleResponses?: Record<string, DeferredResponse>;
        __resolvePeopleResponse?: (query: string, people: unknown[]) => void;
      };
      state.__pendingPeopleResponses = {};
      state.__resolvePeopleResponse = (query, people) => {
        const resolve = state.__pendingPeopleResponses?.[query];
        if (resolve) {
          resolve(new Response(JSON.stringify({
            people,
            pagination: { totalCount: people.length },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
          delete state.__pendingPeopleResponses?.[query];
        }
      };
      window.fetch = ((input: RequestInfo | URL) => {
        const requestUrl = input instanceof Request
          ? input.url
          : input instanceof URL ? input.href : String(input);
        const query = new URL(requestUrl, window.location.href).searchParams.get('q') || '';
        return new Promise<Response>((resolve) => {
          if (state.__pendingPeopleResponses) state.__pendingPeopleResponses[query] = resolve;
        });
      }) as typeof window.fetch;
    });

    try {
      await page.goto(baseUrl + '/dig', { waitUntil: 'domcontentloaded' });
      await page.locator('#tab-people').click();
      await page.locator('#dig-people-input').fill('larry');
      await page.waitForFunction(() => Boolean(
        (window as unknown as { __pendingPeopleResponses?: Record<string, unknown> }).__pendingPeopleResponses?.larry
      ));

      await page.locator('#dig-people-input').fill('prince');
      expect(await page.locator('.dig-people-card').count()).toBe(0);
      expect(await page.locator('#dig-people-status').textContent()).toContain('Search will update shortly.');
      await page.waitForFunction(() => Boolean(
        (window as unknown as { __pendingPeopleResponses?: Record<string, unknown> }).__pendingPeopleResponses?.prince
      ));

      await page.evaluate(() => {
        const state = window as unknown as { __resolvePeopleResponse?: (query: string, people: unknown[]) => void };
        state.__resolvePeopleResponse?.('prince', [{
          username: 'prince',
          displayName: 'Prince',
          avatarUrl: 'https://images.example/prince.jpg',
        }]);
      });
      await page.waitForFunction(() => document.querySelector('.dig-people-name')?.textContent === 'Prince');

      await page.evaluate(() => {
        const state = window as unknown as { __resolvePeopleResponse?: (query: string, people: unknown[]) => void };
        state.__resolvePeopleResponse?.('larry', [{
          username: 'larry_older',
          displayName: 'Larry Older',
          avatarUrl: 'https://images.example/larry.jpg',
        }]);
      });
      await page.waitForTimeout(50);
      expect(await page.locator('.dig-people-name').allTextContents()).toEqual(['Prince']);
      expect(await page.locator('#dig-people-status').textContent()).toContain('Found 1 matching collector.');
    } finally {
      await page.close();
    }
  });

  it('switches between Records and People tabs in-place without page reload', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${baseUrl}/dig?genre=Electronic&style=House`, { waitUntil: 'domcontentloaded' });

      expect(page.url()).toContain('/dig?genre=Electronic&style=House');
      expect(await page.locator('#panel-records').isVisible()).toBe(true);
      expect(await page.locator('#panel-people').isVisible()).toBe(false);

      // Listen for any navigation events to assert no full reload
      let navigated = false;
      page.on('framenavigated', () => { navigated = true; });

      // Click People tab
      await page.locator('#tab-people').click();

      expect(navigated).toBe(false);
      expect(page.url()).toContain('/dig');
      expect(await page.locator('#tab-people').getAttribute('aria-selected')).toBe('true');
      expect(await page.locator('#panel-people').isVisible()).toBe(true);
      expect(await page.locator('#panel-records').isVisible()).toBe(false);

      // Perform in-place People search
      await page.locator('#dig-people-input').fill('larry');
      await page.locator('[data-dig-people-form]').evaluate((form) => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });

      // Wait for search result card
      await page.waitForSelector('.dig-people-card');
      expect(await page.locator('.dig-people-name').textContent()).toContain('Larry Heard');
      expect(await page.locator('.dig-people-username').textContent()).toContain('@larry_heard');
      expect(await page.locator('#dig-people-status').textContent()).toContain('Found 1 matching collector.');

      // Click Records tab to switch back
      await page.locator('#tab-records').click();
      expect(navigated).toBe(false);
      expect(await page.locator('#tab-records').getAttribute('aria-selected')).toBe('true');
      expect(await page.locator('#panel-records').isVisible()).toBe(true);
      expect(await page.locator('#panel-people').isVisible()).toBe(false);

      // Verify filters and query state preserved
      expect(await page.locator('#filter-genre').inputValue()).toBe('Electronic');
      expect(await page.locator('#filter-style').inputValue()).toBe('House');
    } finally {
      await context.close();
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
