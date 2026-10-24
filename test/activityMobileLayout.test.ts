import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Mobile Activity single-column layout', () => {
  jest.setTimeout(30000);

  const viewPath = path.join(__dirname, '../views/activity/index.ejs');
  const stylesheet = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');

  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  async function renderActivity(): Promise<string> {
    const view = await ejs.renderFile(viewPath, {
      getIconSvg,
      events: [{
        listingUrl: '/listings/example-listing',
        releaseTitle: 'Sex machine',
        releaseArtist: 'James Brown',
        listingArtworkUrl: 'https://example.test/cover.webp',
        releaseCoverArtUrl: null,
        artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
        actorAvatarUrl: null,
        actorUsername: 'jaap',
        eventDescription: '@jaap published a drop',
        timeAgo: '2d ago',
        eventType: 'listing.published',
        commentContent: null,
        priceFormatted: '€7.00',
        isPrivate: false,
      }],
    }, { filename: viewPath });

    return `<!doctype html>
      <html lang="en"><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${stylesheet}</style>
      </head><body><main class="main-content">${view}</main></body></html>`;
  }

  it('uses one full-width mobile card column and prevents horizontal overflow', async () => {
    const html = await renderActivity();

    for (const width of [320, 360, 375, 414]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(html);

      const measurements = await page.evaluate(() => {
        const card = document.querySelector('.activity-card') as HTMLElement;
        const body = document.querySelector('.activity-card-body') as HTMLElement;
        const artwork = document.querySelector('.activity-artwork-link') as HTMLElement;
        const content = document.querySelector('.activity-card-content') as HTMLElement;
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          bodyScroll: document.body.scrollWidth,
          cardColumns: getComputedStyle(card).gridTemplateColumns,
          contentDisplay: getComputedStyle(content).display,
          cardWidth: card.getBoundingClientRect().width,
          contentWidth: body.getBoundingClientRect().width,
          artworkWidth: artwork.getBoundingClientRect().width,
          badgePosition: getComputedStyle(document.querySelector('.activity-icon-badge') as HTMLElement).position,
        };
      });

      expect(measurements.document).toBeLessThanOrEqual(width + 1);
      expect(measurements.bodyScroll).toBeLessThanOrEqual(width + 1);
      expect(measurements.cardColumns.trim().split(/\s+/).length).toBe(1);
      expect(measurements.contentDisplay).toBe('block');
      expect(measurements.contentWidth).toBeGreaterThan(measurements.artworkWidth * 2);
      expect(measurements.badgePosition).toBe('absolute');
    }
  });

  it('keeps the feed as a single-column stream on mobile', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.setContent(await renderActivity());

    const feed = await page.locator('.activity-feed-list').evaluate((el) => ({
      display: getComputedStyle(el).display,
      columns: getComputedStyle(el).gridTemplateColumns,
      childCount: el.children.length,
    }));
    expect(feed.display).toBe('grid');
    expect(feed.columns.trim().split(/\s+/).length).toBe(1);
    expect(feed.childCount).toBe(1);
  });
});
