/// <reference lib="dom" />

import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('My Listings UX (#219)', () => {
  jest.setTimeout(30000);

  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const listingPath = path.join(__dirname, '../views/listings/index.ejs');
  const stylesheet = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
  let browser: Browser;

  const makeListing = (id: string, status: string) => ({
    id,
    status,
    tradeAvailable: status === 'published',
    priceFormatted: status === 'traded' ? 'Trade only' : '€24.00',
    release: {
      title: `${status.charAt(0).toUpperCase() + status.slice(1)} Album`,
      artist: 'Test Artist',
      releaseYear: 1994,
      coverArtUrl: null,
    },
    physicalCopy: {
      mediaCondition: 'VG+',
      sleeveCondition: 'VG',
    },
    photos: [],
  });

  const listings = [
    makeListing('listing-draft', 'draft'),
    makeListing('listing-published', 'published'),
    makeListing('listing-sold', 'sold'),
    makeListing('listing-traded', 'traded'),
    makeListing('listing-archived', 'archived'),
  ];

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  async function renderHeader(currentPath: string): Promise<string> {
    return ejs.renderFile(headerPath, {
      getIconSvg,
      currentPath,
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    }, { filename: headerPath });
  }

  async function renderListings(viewListings = listings, viewHidden = false): Promise<string> {
    return ejs.renderFile(listingPath, {
      getIconSvg,
      listings: viewListings,
      viewHidden,
    }, { filename: listingPath });
  }

  function documentHtml(header: string, listingPage: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="http://localhost/">
  <style>${stylesheet}</style>
</head>
<body>
  ${header}
  <main class="main-content container">${listingPage}</main>
</body>
</html>`;
  }

  async function loadHtml(page: Page, html: string, width = 375, height = 812): Promise<void> {
    await page.setViewportSize({ width, height });
    // The view contract is layout and navigation; prevent sample artwork requests.
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html);
  }

  it('adds one accessible My Profile back action to the DROP header without changing listing-editor back navigation', async () => {
    const header = await renderHeader('/listings');
    expect(header).toContain('<span class="mobile-context-heading">DROP</span>');
    expect(header).toContain('href="/profile" class="mobile-context-back mobile-context-back-icon-only" aria-label="Back to My Profile"');
    expect((header.match(/aria-label="Back to My Profile"/g) || []).length).toBe(1);

    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await loadHtml(page, documentHtml(header, await renderListings()));
    const back = page.locator('.mobile-context-header a[aria-label="Back to My Profile"]');
    expect(await back.count()).toBe(1);
    expect(await back.isVisible()).toBe(true);
    expect(await back.getAttribute('href')).toBe('/profile');
    expect(await page.locator('.my-listings-page .mobile-context-back').count()).toBe(0);

    const editHeader = await renderHeader('/listings/11111111-1111-4111-8111-111111111111/edit');
    expect(editHeader).toContain('href="/listings" class="mobile-context-back mobile-context-back-icon-only" aria-label="Back to My Listings"');
    expect(editHeader).not.toContain('aria-label="Back to My Profile"');
    await page.close();
  });

  it('routes both sell/create entry points to /drop/new and renders the shared SVG action language', async () => {
    const populatedHtml = await renderListings();
    expect(populatedHtml).toContain('href="/drop/new"');
    expect(populatedHtml).toContain('>+ Sell a Record</span>');
    expect(populatedHtml).not.toContain('href="/listings/new"');
    expect(populatedHtml).toContain('class="icon icon-edit"');
    expect(populatedHtml).toContain('class="icon icon-search"');
    expect(populatedHtml).toContain('class="icon icon-confirmed"');
    expect(populatedHtml).toContain('class="icon icon-close"');

    const emptyHtml = await renderListings([], false);
    expect(emptyHtml).toContain('href="/drop/new"');
    expect(emptyHtml).toContain('Create Your First Listing');
    expect(emptyHtml).not.toContain('href="/listings/new"');

    const hiddenEmptyHtml = await renderListings([], true);
    expect(hiddenEmptyHtml).toContain('No hidden completed listings.');
    expect(hiddenEmptyHtml).not.toContain('Create Your First Listing');
  });

  it('preserves action visibility, labels, methods, and routes for each listing status', async () => {
    const html = await renderListings();
    expect(html).toContain('data-listing-status="draft"');
    expect(html).toContain('data-listing-status="published"');
    expect(html).toContain('data-listing-status="sold"');
    expect(html).toContain('data-listing-status="traded"');
    expect(html).toContain('data-listing-status="archived"');

    expect(html).toContain('href="/listings/listing-draft/preview"');
    expect(html).toContain('href="/listings/listing-draft/edit"');
    expect(html).toContain('action="/listings/listing-draft/publish" method="POST"');
    expect(html).toContain('action="/listings/listing-published/unpublish" method="POST"');

    const published = html.slice(
      html.indexOf('data-listing-id="listing-published"'),
      html.indexOf('</article>', html.indexOf('data-listing-id="listing-published"'))
    );
    expect(published).toContain('Edit &amp; Photos');
    expect(published).toContain('Unpublish');
    expect(published).not.toContain('Publish</span>');

    for (const id of ['listing-sold', 'listing-traded', 'listing-archived']) {
      const start = html.indexOf(`data-listing-id="${id}"`);
      const end = html.indexOf('</article>', start);
      const card = html.slice(start, end);
      expect(card).toContain('Preview');
      expect(card).toContain('Dismiss');
      expect(card).not.toContain('/edit"');
      expect(card).not.toContain('/publish"');
      expect(card).not.toContain('/unpublish"');
    }

    const hiddenHtml = await renderListings([makeListing('listing-hidden-sold', 'sold')], true);
    expect(hiddenHtml).toContain('action="/listings/listing-hidden-sold/restore-dismissed" method="POST"');
    expect(hiddenHtml).toContain('Restore');
    expect(hiddenHtml).not.toContain('action="/listings/listing-hidden-sold/dismiss"');
  });

  it('has no horizontal overflow and wraps actions cleanly from narrow phones to desktop', async () => {
    const page = await browser.newPage();
    const html = documentHtml(await renderHeader('/listings'), await renderListings());

    for (const viewport of [
      { width: 320, height: 740 },
      { width: 360, height: 740 },
      { width: 375, height: 812 },
      { width: 414, height: 896 },
      { width: 430, height: 932 },
      { width: 1280, height: 800 },
    ]) {
      await loadHtml(page, html, viewport.width, viewport.height);
      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        pageWidth: document.querySelector('.my-listings-page')?.getBoundingClientRect().width ?? 0,
        cardsWidth: Array.from(document.querySelectorAll('.my-listings-card'))
          .reduce((maximum, card) => Math.max(maximum, card.getBoundingClientRect().right), 0),
      }));

      expect(dimensions.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.pageWidth).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.cardsWidth).toBeLessThanOrEqual(viewport.width);
      expect(await page.locator('.my-listings-card').count()).toBe(5);
      expect(await page.locator('.my-listings-actions').first().isVisible()).toBe(true);
    }

    await page.close();
  });
});
