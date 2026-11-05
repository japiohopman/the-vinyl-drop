import { Browser, chromium } from '@playwright/test';
import { Server } from 'http';
import { createApp } from '../src/app';
import * as peopleSearchService from '../src/app/services/peopleSearchService';

jest.mock('../src/app/services/peopleSearchService');

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
        await expect(page.getByRole('search')).toBeVisible();
      }
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
      await input.fill('cr');

      const firstSuggestion = page.getByRole('link', { name: /Crate Queen @crate_queen/ });
      await expect(firstSuggestion).toBeVisible({ timeout: 5000 });
      await input.press('ArrowDown');
      await expect(firstSuggestion).toBeFocused();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/profiles/crate_queen');
      await expect(page.getByText('Public profile')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
