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
      events: [
        {
          listingUrl: '/listings/example-listing',
          releaseTitle: 'Sex machine',
          releaseArtist: 'James Brown',
          listingArtworkUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
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
        },
        {
          listingUrl: '/listings/another-listing',
          releaseTitle: 'Take It Back (Extended Club Mix)',
          releaseArtist: 'A Different Artist Name',
          listingArtworkUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
          releaseCoverArtUrl: null,
          artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
          actorAvatarUrl: null,
          actorUsername: 'recordfan',
          eventDescription: '@recordfan commented on a drop',
          timeAgo: '1h ago',
          eventType: 'comment.created',
          commentContent: 'A deliberately longer comment that should wrap naturally across the available card width without forcing horizontal scrolling on narrow phones.',
          priceFormatted: '',
          isPrivate: false,
        },
        {
          listingUrl: '/listings/private-favorite',
          releaseTitle: 'Private white label with a longer release title',
          releaseArtist: 'Wax Collector',
          listingArtworkUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
          releaseCoverArtUrl: null,
          artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
          actorAvatarUrl: null,
          actorUsername: 'waxcollector',
          eventDescription: '@waxcollector saved a record',
          timeAgo: '3h ago',
          eventType: 'favorite.created',
          commentContent: null,
          priceFormatted: '€7.00',
          isPrivate: true,
        },
      ],
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
        const header = document.querySelector('.activity-card-header') as HTMLElement;
        const badge = document.querySelector('.activity-icon-badge') as HTMLElement;
        const headerRect = header.getBoundingClientRect();
        const badgeRect = badge.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          bodyScroll: document.body.scrollWidth,
          cardColumns: getComputedStyle(card).gridTemplateColumns,
          contentDisplay: getComputedStyle(content).display,
          cardWidth: card.getBoundingClientRect().width,
          contentWidth: body.getBoundingClientRect().width,
          headerWidth: headerRect.width,
          artworkWidth: artwork.getBoundingClientRect().width,
          artworkRight: artwork.getBoundingClientRect().right,
          contentTop: content.getBoundingClientRect().top,
          badgePosition: getComputedStyle(badge).position,
          badgeLeft: badgeRect.left,
          badgeBottom: badgeRect.bottom,
        };
      });

      expect(measurements.document).toBeLessThanOrEqual(width + 1);
      expect(measurements.bodyScroll).toBeLessThanOrEqual(width + 1);
      expect(measurements.cardColumns.trim().split(/\s+/).length).toBe(1);
      expect(measurements.contentDisplay).toBe('block');
      expect(measurements.contentWidth).toBeGreaterThanOrEqual(measurements.cardWidth - 40);
      expect(measurements.headerWidth).toBeGreaterThanOrEqual(measurements.contentWidth - 1);
      expect(measurements.artworkWidth).toBe(64);
      expect(measurements.badgePosition).toBe('absolute');
      expect(measurements.badgeLeft).toBeGreaterThanOrEqual(measurements.artworkRight);
      expect(measurements.badgeBottom).toBeLessThanOrEqual(measurements.contentTop);
    }
  });

  it('keeps multiple activity cards in one vertical stream on mobile', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.setContent(await renderActivity());

    const feed = await page.locator('.activity-feed-list').evaluate((el) => {
      const cards = Array.from(el.children).map((child) => {
        const rect = child.getBoundingClientRect();
        return { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width };
      });
      return {
        display: getComputedStyle(el).display,
        columns: getComputedStyle(el).gridTemplateColumns,
        cards,
      };
    });
    expect(feed.display).toBe('grid');
    expect(feed.columns.trim().split(/\\s+/).length).toBe(1);
    expect(feed.cards).toHaveLength(3);
    expect(feed.cards[1].top).toBeGreaterThan(feed.cards[0].bottom);
    expect(feed.cards[2].top).toBeGreaterThan(feed.cards[1].bottom);
    for (const card of feed.cards.slice(1)) {
      expect(Math.abs(card.left - feed.cards[0].left)).toBeLessThanOrEqual(1);
      expect(Math.abs(card.width - feed.cards[0].width)).toBeLessThanOrEqual(1);
    }
  });

  it('preserves the desktop card and badge columns', async () => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.setContent(await renderActivity());

    const layout = await page.locator('.activity-card').first().evaluate((card) => {
      const content = card.querySelector('.activity-card-content') as HTMLElement;
      return {
        cardColumns: getComputedStyle(card).gridTemplateColumns,
        contentDisplay: getComputedStyle(content).display,
        contentColumns: getComputedStyle(content).gridTemplateColumns,
      };
    });

    expect(layout.cardColumns.trim().split(/\\s+/).length).toBe(2);
    expect(layout.contentDisplay).toBe('grid');
    expect(layout.contentColumns.trim().split(/\\s+/).length).toBe(2);
  });
});
