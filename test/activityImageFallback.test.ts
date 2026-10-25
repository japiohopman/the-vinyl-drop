/// <reference lib="dom" />

import { chromium, Browser, Page } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import path from 'path';
import ejs from 'ejs';
import { getIconSvg } from '../src/app/utils/iconRegistry';

jest.setTimeout(45000);

describe('Activity artwork and avatar image failures (#142)', () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  const viewPath = path.resolve(process.cwd(), 'views/activity/index.ejs');
  const events = [
    {
      listingUrl: '/listings/fallback-record',
      releaseTitle: 'Fallen Art',
      releaseArtist: 'The Test Pressings',
      listingArtworkUrl: '/test-assets/seller-broken.svg',
      releaseCoverArtUrl: '/test-assets/catalog-art.svg',
      artworkFallbackUrl: '/test-assets/catalog-art.svg',
      actorAvatarUrl: '/test-assets/avatar-good.svg',
      actorUsername: 'catalogfan',
      eventDescription: '@catalogfan published a drop',
      timeAgo: '2d ago',
      eventType: 'listing.published',
      commentContent: null,
      priceFormatted: '€7.00',
      isPrivate: false,
    },
    {
      listingUrl: '/listings/no-art-record',
      releaseTitle: 'No Art Left',
      releaseArtist: 'Placeholder Band',
      listingArtworkUrl: '/test-assets/terminal-broken.svg',
      releaseCoverArtUrl: null,
      artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
      actorAvatarUrl: null,
      actorUsername: 'terminaluser',
      eventDescription: '@terminaluser saved a record',
      timeAgo: '3h ago',
      eventType: 'favorite.created',
      commentContent: null,
      priceFormatted: '',
      isPrivate: true,
    },
    {
      listingUrl: '/listings/broken-avatar-record',
      releaseTitle: 'Working Sleeve',
      releaseArtist: 'Valid Artwork',
      listingArtworkUrl: '/test-assets/art-good.svg',
      releaseCoverArtUrl: null,
      artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
      actorAvatarUrl: '/test-assets/avatar-broken.svg',
      actorUsername: 'brokenavatar',
      eventDescription: '@brokenavatar commented on a drop',
      timeAgo: '1h ago',
      eventType: 'comment.created',
      commentContent: 'The artwork loads, but the profile image does not.',
      priceFormatted: '',
      isPrivate: false,
    },
    {
      listingUrl: '/listings/no-artwork-source',
      releaseTitle: 'No Uploaded Cover',
      releaseArtist: 'No Catalog Art',
      listingArtworkUrl: null,
      releaseCoverArtUrl: null,
      artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
      actorAvatarUrl: null,
      actorUsername: 'placeholderuser',
      eventDescription: '@placeholderuser published a drop',
      timeAgo: '4h ago',
      eventType: 'listing.published',
      commentContent: null,
      priceFormatted: '',
      isPrivate: false,
    },
  ];

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });

    const app = express();
    app.use(express.static(path.resolve(process.cwd(), 'public')));

    app.get('/test/activity-image-fallbacks', async (_req, res, next) => {
      try {
        const bodyHtml = await ejs.renderFile(viewPath, { getIconSvg, events });
        res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/style.css">
  <script src="/js/artwork-fallback.js"></script>
</head>
<body>
  <main class="main-content container">${bodyHtml}</main>
</body>
</html>`);
      } catch (error) {
        next(error);
      }
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
    if (browser) await browser.close();
  });

  async function interceptImageRequests(page: Page): Promise<void> {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#c8c8c8"/></svg>';

    await page.route('**/test-assets/seller-broken.svg', (route) => route.abort());
    await page.route('**/test-assets/terminal-broken.svg', (route) => route.abort());
    await page.route('**/test-assets/avatar-broken.svg', (route) => route.abort());
    await page.route('**/assets/vinyl-placeholder.svg', (route) => route.abort());

    for (const asset of ['catalog-art.svg', 'avatar-good.svg', 'art-good.svg']) {
      await page.route('**/test-assets/' + asset, (route) => route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: svg,
      }));
    }
  }

  it('cascades broken seller artwork to catalog art, then to an accessible terminal fallback if the local placeholder also fails', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 1000 } });
    await interceptImageRequests(page);
    await page.goto(`${baseUrl}/test/activity-image-fallbacks`, { waitUntil: 'domcontentloaded' });

    const images = page.locator('.activity-record-artwork');
    const sellerPhoto = images.nth(0);
    await page.waitForFunction(() => {
      const image = document.querySelectorAll('.activity-record-artwork')[0] as HTMLImageElement;
      return image && image.getAttribute('src') === '/test-assets/catalog-art.svg' && image.complete && image.naturalWidth > 0;
    });

    expect(await sellerPhoto.getAttribute('src')).toBe('/test-assets/catalog-art.svg');
    expect(await sellerPhoto.getAttribute('alt')).toBe('Artwork for Fallen Art by The Test Pressings');
    expect(await sellerPhoto.isVisible()).toBe(true);

    const noArtImage = images.nth(1);
    await noArtImage.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelectorAll('.activity-record-artwork')[1] as HTMLImageElement;
      const fallback = image?.parentElement?.querySelector('[data-artwork-terminal-fallback]') as HTMLElement | null;
      return Boolean(image && image.hidden && fallback && !fallback.hidden);
    });

    expect(await noArtImage.getAttribute('src')).toBe('/assets/vinyl-placeholder.svg');
    expect(await noArtImage.isHidden()).toBe(true);

    const terminalFallback = page.locator('.activity-card').nth(1).locator('[data-artwork-terminal-fallback]');
    expect(await terminalFallback.isVisible()).toBe(true);
    expect(await terminalFallback.getAttribute('role')).toBe('img');
    expect(await terminalFallback.getAttribute('aria-label')).toBe('Artwork unavailable for No Art Left by Placeholder Band');
    await page.close();
  });

  it('shows the local vinyl placeholder when no artwork source exists and the placeholder loads', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 1000 } });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#c8c8c8"/></svg>';
    await page.route('**/assets/vinyl-placeholder.svg', (route) => route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: svg,
    }));
    await page.goto(`${baseUrl}/test/activity-image-fallbacks`, { waitUntil: 'domcontentloaded' });

    const placeholder = page.locator('.activity-card').nth(3).locator('.activity-record-artwork');
    await page.waitForFunction(() => {
      const image = document.querySelectorAll('.activity-record-artwork')[3] as HTMLImageElement;
      return image && image.getAttribute('src') === '/assets/vinyl-placeholder.svg' && image.complete && image.naturalWidth > 0;
    });

    expect(await placeholder.isVisible()).toBe(true);
    expect(await placeholder.getAttribute('src')).toBe('/assets/vinyl-placeholder.svg');
    expect(await placeholder.getAttribute('alt')).toBe('Artwork for No Uploaded Cover by No Catalog Art');
    expect(await page.locator('.activity-card').nth(3).locator('[data-artwork-terminal-fallback]').isHidden()).toBe(true);
    await page.close();
  });

  it('keeps working avatars visible and replaces a broken avatar with initials without showing a broken-image icon', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 1000 } });
    await interceptImageRequests(page);
    await page.goto(`${baseUrl}/test/activity-image-fallbacks`, { waitUntil: 'domcontentloaded' });

    const goodAvatar = page.locator('.activity-card').nth(0).locator('[data-avatar-image]');
    await page.waitForFunction(() => {
      const image = document.querySelectorAll('[data-avatar-image]')[0] as HTMLImageElement;
      return image && image.complete && image.naturalWidth > 0;
    });
    expect(await goodAvatar.isVisible()).toBe(true);
    expect(await goodAvatar.getAttribute('alt')).toBe('');

    const missingAvatarCard = page.locator('.activity-card').nth(1);
    expect(await missingAvatarCard.locator('[data-avatar-image]').count()).toBe(0);
    expect(await missingAvatarCard.locator('.activity-avatar-fallback').textContent()).toBe('T');
    expect(await missingAvatarCard.locator('.activity-avatar-fallback').isVisible()).toBe(true);

    const brokenAvatarCard = page.locator('.activity-card').nth(2);
    const brokenAvatar = brokenAvatarCard.locator('[data-avatar-image]');
    await brokenAvatar.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelectorAll('[data-avatar-image]')[1] as HTMLImageElement;
      const fallback = image?.nextElementSibling as HTMLElement | null;
      return Boolean(image && image.hidden && fallback && !fallback.hidden);
    });
    expect(await brokenAvatar.isHidden()).toBe(true);
    expect(await brokenAvatarCard.locator('.activity-avatar-fallback').textContent()).toBe('B');
    expect(await brokenAvatarCard.locator('.activity-avatar-fallback').isVisible()).toBe(true);

    const workingArt = page.locator('.activity-card').nth(2).locator('.activity-record-artwork');
    expect(await workingArt.getAttribute('src')).toBe('/test-assets/art-good.svg');
    expect(await workingArt.isVisible()).toBe(true);
    await page.close();
  });
});
