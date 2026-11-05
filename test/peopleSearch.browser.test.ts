import { Browser, chromium } from '@playwright/test';
import { Server } from 'http';
import { createApp } from '../src/app';
import * as peopleSearchService from '../src/app/services/peopleSearchService';

jest.mock('../src/app/services/peopleSearchService', () => ({
  ...jest.requireActual('../src/app/services/peopleSearchService'),
  getPeopleSearchSuggestions: jest.fn(),
  searchPeople: jest.fn(),
}));

jest.setTimeout(120_000);

const suggestions = [
  { username: 'crate_queen', displayName: 'Crate Queen', avatarUrl: null },
  { username: 'crate_digger', displayName: 'Crate Digger', avatarUrl: null },
];

describe('People search browser experience — Issue #297', () => {
  let server: Server;
  let baseUrl: string;
  let browser!: Browser;

  beforeAll(async () => {
    (peopleSearchService.getPeopleSearchSuggestions as jest.Mock).mockResolvedValue(suggestions);
    (peopleSearchService.searchPeople as jest.Mock).mockResolvedValue({
      items: suggestions,
      totalCount: 2,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      hasMore: false,
    });

    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the local People search test server address.');
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

  it('keeps the People search page within phone, tablet and desktop viewports', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.goto(baseUrl + '/people?q=crate', { waitUntil: 'domcontentloaded' });
      for (const width of [360, 390, 430, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));

        expect(dimensions.viewport).toBe(width);
        expect(dimensions.document).toBeLessThanOrEqual(width);
        expect(dimensions.body).toBeLessThanOrEqual(width);
        expect(await page.getByRole('search').isVisible()).toBe(true);
      }
    } finally {
      await context.close();
    }
  });

  it('keeps live suggestions easy to activate on a touch viewport', async () => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();

    try {
      await page.route('**/profiles/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html lang="en"><title>Profile test</title><body>Public profile</body></html>',
        });
      });

      await page.goto(baseUrl + '/people', { waitUntil: 'domcontentloaded' });
      await page.getByRole('searchbox', { name: 'Search public profiles' }).fill('cr');

      const suggestion = page.getByRole('link', { name: /Crate Queen @crate_queen/ });
      await suggestion.waitFor({ state: 'visible', timeout: 5000 });
      expect(await suggestion.isVisible()).toBe(true);
      const bounds = await suggestion.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);

      await suggestion.tap();
      await page.waitForURL('**/profiles/crate_queen');
      expect(await page.getByText('Public profile').isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('normalizes compatibility characters before applying the live minimum query length', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const suggestionRequests: string[] = [];

    try {
      await page.route('**/api/people-suggestions**', async (route) => {
        suggestionRequests.push(route.request().url());
        await route.continue();
      });

      await page.goto(baseUrl + '/people', { waitUntil: 'domcontentloaded' });
      const input = page.getByRole('searchbox', { name: 'Search public profiles' });
      await input.fill('ﬀ');

      const firstSuggestion = page.getByRole('link', { name: /Crate Queen @crate_queen/ });
      await firstSuggestion.waitFor({ state: 'visible', timeout: 5000 });
      expect(suggestionRequests).toHaveLength(1);
      expect(new URL(suggestionRequests[0]).searchParams.get('q')).toBe('ﬀ');
    } finally {
      await context.close();
    }
  });

  it('aborts an in-flight suggestion request when the pointer leaves the search form', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    let resolveRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      resolveRequestStarted = resolve;
    });

    try {
      await page.addInitScript(() => {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
          if (url.includes('/api/people-suggestions') && init?.signal) {
            init.signal.addEventListener('abort', () => {
              (window as Window & { __peopleSuggestionsAborted?: boolean }).__peopleSuggestionsAborted = true;
            }, { once: true });
          }
          return nativeFetch(input, init);
        };
      });
      await page.route('**/api/people-suggestions**', async (route) => {
        resolveRequestStarted();
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ suggestions }),
          });
        } catch {
          // The browser has already aborted the intercepted request.
        }
      });

      await page.goto(baseUrl + '/people', { waitUntil: 'domcontentloaded' });
      await page.getByRole('searchbox', { name: 'Search public profiles' }).fill('cr');
      await requestStarted;
      await page.getByRole('heading', { name: 'Find people' }).click();

      expect(await page.evaluate(() => (
        window as Window & { __peopleSuggestionsAborted?: boolean }
      ).__peopleSuggestionsAborted)).toBe(true);
      expect(await page.locator('#people-search-suggestions').isHidden()).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('cancels a pending debounce when the pointer leaves the search form', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const suggestionRequests: string[] = [];

    try {
      await page.route('**/api/people-suggestions**', async (route) => {
        suggestionRequests.push(route.request().url());
        await route.continue();
      });

      await page.goto(baseUrl + '/people', { waitUntil: 'domcontentloaded' });
      await page.getByRole('searchbox', { name: 'Search public profiles' }).fill('cr');
      await page.getByRole('heading', { name: 'Find people' }).click();
      await page.waitForTimeout(300);

      expect(suggestionRequests).toHaveLength(0);
      expect(await page.locator('#people-search-suggestions').isHidden()).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('debounces live suggestions and supports arrow-key navigation to a public profile', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.route('**/profiles/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html lang="en"><title>Profile test</title><body>Public profile</body></html>',
        });
      });

      await page.goto(baseUrl + '/people', { waitUntil: 'domcontentloaded' });
      const input = page.getByRole('searchbox', { name: 'Search public profiles' });
      const suggestionRequests: string[] = [];
      await page.route('**/api/people-suggestions**', async (route) => {
        suggestionRequests.push(route.request().url());
        await route.continue();
      });
      const finalSuggestionRequest = page.waitForRequest((candidate) =>
        candidate.url().includes('/api/people-suggestions')
      );
      await input.pressSequentially('crate', { delay: 70 });
      const request = await finalSuggestionRequest;

      const firstSuggestion = page.getByRole('link', { name: /Crate Queen @crate_queen/ });
      await firstSuggestion.waitFor({ state: 'visible', timeout: 5000 });
      expect(await firstSuggestion.isVisible()).toBe(true);
      await page.waitForTimeout(260);
      expect(suggestionRequests).toHaveLength(1);
      expect(new URL(request.url()).searchParams.get('q')).toBe('crate');

      // IME-owned ArrowDown/Process keys must not move focus out of the input.
      await input.evaluate((element) => {
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }));
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          keyCode: 229,
          bubbles: true,
          cancelable: true,
        }));
      });
      expect(await input.evaluate((element) => document.activeElement === element)).toBe(true);

      await input.press('ArrowDown');
      expect(await firstSuggestion.evaluate((element) => document.activeElement === element)).toBe(true);
      await page.keyboard.press('Enter');
      await page.waitForURL('**/profiles/crate_queen');
      expect(await page.getByText('Public profile').isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  });
});
