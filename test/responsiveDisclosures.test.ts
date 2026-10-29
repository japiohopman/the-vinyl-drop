import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import path from 'path';
import ejs from 'ejs';
import { getIconSvg } from '../src/app/utils/iconRegistry';

jest.setTimeout(45000);

describe('Responsive disclosure browser behavior', () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  const browseTemplatePath = path.resolve(process.cwd(), 'views/browse/index.ejs');
  const responsiveDigTemplatePath = path.resolve(process.cwd(), 'views/browse/responsive-dig.ejs');
  const releaseTemplatePath = path.resolve(process.cwd(), 'views/listings/select-release.ejs');
  const footerTemplatePath = path.resolve(process.cwd(), 'views/partials/footer.ejs');
  const navTemplatePath = path.resolve(process.cwd(), 'views/partials/nav.ejs');

  async function renderNav(): Promise<string> {
    return ejs.renderFile(navTemplatePath, {
      getIconSvg,
      currentPath: '/dig',
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    });
  }

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });

    const app = express();
    app.use(express.static(path.resolve(process.cwd(), 'public')));

    app.get('/test/responsive-browse', async (_req, res, next) => {
      try {
        const browseHtml = await ejs.renderFile(browseTemplatePath, {
          title: 'Dig Vinyl Records',
          formatOptions: [{ value: '12-inch', label: '12-inch', description: '12-inch records' }],
          whiteLabelAvailable: false,
          filters: {
            q: '',
            genre: '',
            condition: '',
            minPrice: '',
            maxPrice: '',
            sort: 'newest',
            formats: [],
            whiteLabel: false,
            view: 'grid',
          },
          listings: [],
          pagination: { page: 1, totalPages: 1, totalCount: 0 },
          errorMessage: null,
        });
        const footerHtml = await ejs.renderFile(footerTemplatePath);
        const navHtml = await renderNav();
        res.send(wrapPage(browseHtml, footerHtml, navHtml));
      } catch (error) {
        next(error);
      }
    });

    app.get('/test/responsive-dig', async (_req, res, next) => {
      try {
        const digHtml = await ejs.renderFile(responsiveDigTemplatePath, {
          title: 'Dig Vinyl Records',
          listings: [],
          formatOptions: [{ value: '12-inch', label: '12-inch', description: '12-inch records' }],
          whiteLabelAvailable: false,
          filters: {
            q: 'De La Soul',
            genre: 'Hip Hop',
            condition: '',
            minPrice: '',
            maxPrice: '',
            sort: 'newest',
            formats: [],
            whiteLabel: false,
            view: 'grid',
          },
          pagination: { page: 1, totalPages: 1, totalCount: 0 },
          errorMessage: null,
          items: [],
          totalCount: 0,
          hasMore: false,
        });
        const footerHtml = await ejs.renderFile(footerTemplatePath);
        const navHtml = await renderNav();
        res.send(wrapPage(digHtml, footerHtml, navHtml));
      } catch (error) {
        next(error);
      }
    });

    app.get('/test/select-release', async (_req, res, next) => {
      try {
        const releaseHtml = await ejs.renderFile(releaseTemplatePath, {
          title: 'Select a Release to Sell',
          query: '',
          searchResults: [],
          releases: [{
            id: 'release-1',
            title: 'Kind of Blue',
            artist: 'Miles Davis',
            label: 'Columbia',
            releaseYear: 1959,
            format: '12-inch LP',
            coverArtUrl: '',
          }],
        });
        const footerHtml = await ejs.renderFile(footerTemplatePath);
        const navHtml = await renderNav();
        res.send(wrapPage(releaseHtml, footerHtml, navHtml));
      } catch (error) {
        next(error);
      }
    });

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  function wrapPage(bodyHtml: string, footerHtml: string, navHtml: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/style-after-features.css">
  <link rel="stylesheet" href="/css/activity-release-selection.css">
  <link rel="stylesheet" href="/css/browse-dig-controls.css">
  <link rel="stylesheet" href="/css/style-after-activity.css">
  <link rel="stylesheet" href="/css/release-selection-overrides.css">
  <link rel="stylesheet" href="/css/style-after-release-selection.css">
  <link rel="stylesheet" href="/css/style-after-listing-forms.css">
  <link rel="stylesheet" href="/css/style-after-profile-pages.css">
  <link rel="stylesheet" href="/css/style-after-profile-editor.css">
  <script src="/js/responsive-disclosures.js" defer></script>
</head>
<body>
  ${navHtml}
  <main class="main-content container">${bodyHtml}</main>
  ${footerHtml}
</body>
</html>`;
  }

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (browser) {
      await browser.close();
    }
  });

  it('keeps the browse search and footer links visible on desktop', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${baseUrl}/test/responsive-browse`, { waitUntil: 'networkidle' });

    expect(await page.locator('#search-q').isVisible()).toBe(true);
    expect(await page.locator('.footer-links-menu a[href="/contact"]').isVisible()).toBe(true);
    expect(await page.locator('.browse-mobile-filter-panel').getAttribute('open')).not.toBeNull();
    expect(await page.locator('.footer-links-menu').getAttribute('open')).not.toBeNull();

    await page.close();
  });

  it('reveals browse filters on demand and moves information links into About on mobile', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(`${baseUrl}/test/responsive-browse`, { waitUntil: 'networkidle' });

    const search = page.locator('#search-q');
    const contact = page.locator('.mobile-you-info-links a[href="/contact"]');
    expect(await search.isVisible()).toBe(false);
    expect(await contact.isVisible()).toBe(false);

    const browseSummary = page.locator('.browse-mobile-filter-summary');
    const browseSummaryBox = await browseSummary.boundingBox();
    expect(browseSummaryBox).not.toBeNull();
    if (browseSummaryBox) expect(browseSummaryBox.height).toBeGreaterThanOrEqual(44);

    const formatChip = page.locator('.browse-format-chip').first();
    await browseSummary.click();
    expect(await search.isVisible()).toBe(true);
    const formatChipBox = await formatChip.boundingBox();
    expect(formatChipBox).not.toBeNull();
    if (formatChipBox) expect(formatChipBox.height).toBeGreaterThanOrEqual(44);

    expect(await page.locator('.site-footer').isVisible()).toBe(false);
    expect(await contact.isVisible()).toBe(false);

    await page.locator('#mobile-you-trigger').click();
    expect(await page.locator('#mobile-you-surface').isVisible()).toBe(true);

    const aboutTrigger = page.locator('#mobile-you-about-trigger');
    expect(await aboutTrigger.isVisible()).toBe(true);
    const aboutBox = await aboutTrigger.boundingBox();
    expect(aboutBox).not.toBeNull();
    if (aboutBox) expect(aboutBox.height).toBeGreaterThanOrEqual(44);

    for (const href of ['/contact', '/privacy', '/terms', '/community-rules']) {
      expect(await page.locator(`.mobile-you-info-links a[href="${href}"]`).isVisible()).toBe(false);
    }

    await aboutTrigger.click();
    expect(await page.locator('#mobile-you-about-view').isVisible()).toBe(true);

    for (const href of ['/contact', '/privacy', '/terms', '/community-rules']) {
      const link = page.locator(`.mobile-you-info-links a[href="${href}"]`);
      expect(await link.isVisible()).toBe(true);
      const linkBox = await link.boundingBox();
      expect(linkBox).not.toBeNull();
      // Allow sub-pixel browser layout rounding while still enforcing a 44px touch target.
      if (linkBox) expect(linkBox.height).toBeGreaterThanOrEqual(43.9);
    }

    await page.locator('#mobile-you-about-back').click();
    expect(await page.locator('#mobile-you-main-view').isVisible()).toBe(true);
    await page.close();
  });

  it('puts Dig search first on mobile and desktop while preserving the desktop Grid/List control', async () => {
    const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await mobilePage.goto(`${baseUrl}/test/responsive-dig`, { waitUntil: 'networkidle' });

    expect(await mobilePage.locator('#dig-primary-search').isVisible()).toBe(true);
    expect(await mobilePage.locator('.dig-primary-search-form button').isVisible()).toBe(true);
    expect(await mobilePage.locator('.view-mode-toggle').isVisible()).toBe(false);
    expect(await mobilePage.locator('.dig-page-header h1').isVisible()).toBe(true);
    expect(await mobilePage.locator('.browse-header h1').isVisible()).toBe(false);
    expect(await mobilePage.locator('.dig-responsive-mobile-header').isVisible()).toBe(false);
    expect(await mobilePage.locator('.site-footer').isVisible()).toBe(false);

    const searchBox = await mobilePage.locator('.dig-search-control-bar').boundingBox();
    const resultsBox = await mobilePage.locator('.dig-responsive-desktop').boundingBox();
    expect(searchBox).not.toBeNull();
    expect(resultsBox).not.toBeNull();
    if (searchBox && resultsBox) expect(searchBox.y).toBeLessThan(resultsBox.y);
    await mobilePage.close();

    const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await desktopPage.goto(`${baseUrl}/test/responsive-dig`, { waitUntil: 'networkidle' });

    expect(await desktopPage.locator('#dig-primary-search').isVisible()).toBe(true);
    expect(await desktopPage.locator('.view-mode-toggle').isVisible()).toBe(true);
    expect(await desktopPage.locator('.browse-header h1').isVisible()).toBe(true);
    expect(await desktopPage.locator('.site-footer').isVisible()).toBe(true);
    await desktopPage.close();
  });

  it('syncs pending search terms and filter controls between the separate Dig forms', async () => {
    const filterPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await filterPage.goto(`${baseUrl}/test/responsive-dig`, { waitUntil: 'networkidle' });
    await filterPage.locator('.browse-mobile-filter-summary').click();
    await filterPage.locator('#dig-primary-search').fill('Fresh needle');
    await filterPage.locator('.browse-format-chip').first().click();
    await filterPage.waitForURL((url) => url.pathname === '/dig');

    const filterUrl = new URL(filterPage.url());
    expect(filterUrl.searchParams.get('q')).toBe('Fresh needle');
    expect(filterUrl.searchParams.get('formatToggle')).toBe('12-inch');
    await filterPage.close();

    const searchPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await searchPage.goto(`${baseUrl}/test/responsive-dig`, { waitUntil: 'networkidle' });
    await searchPage.locator('.browse-mobile-filter-summary').click();
    await searchPage.locator('#filter-genre').selectOption('Jazz');
    await searchPage.locator('#dig-primary-search').fill('New genre query');
    await searchPage.locator('.dig-primary-search-form button').click();
    await searchPage.waitForURL((url) => url.pathname === '/dig');

    const searchUrl = new URL(searchPage.url());
    expect(searchUrl.searchParams.get('q')).toBe('New genre query');
    expect(searchUrl.searchParams.get('genre')).toBe('Jazz');
    await searchPage.close();
  });

  it('keeps release search and selection actions at least 44px high on narrow screens', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
    await page.goto(`${baseUrl}/test/select-release`, { waitUntil: 'networkidle' });

    for (const selector of [
      '.select-release-search-form input',
      '.select-release-search-form button',
      '.select-release-custom-option > a',
      '.select-release-result > a',
    ]) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box).not.toBeNull();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await page.close();
  });
});
