import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import path from 'path';
import ejs from 'ejs';

jest.setTimeout(45000);

describe('Responsive disclosure browser behavior', () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  const browseTemplatePath = path.resolve(process.cwd(), 'views/browse/index.ejs');
  const releaseTemplatePath = path.resolve(process.cwd(), 'views/listings/select-release.ejs');
  const footerTemplatePath = path.resolve(process.cwd(), 'views/partials/footer.ejs');

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
        res.send(wrapPage(browseHtml, footerHtml));
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
        res.send(wrapPage(releaseHtml, footerHtml));
      } catch (error) {
        next(error);
      }
    });

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  function wrapPage(bodyHtml: string, footerHtml: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/style.css">
  <script src="/js/responsive-disclosures.js" defer></script>
</head>
<body>
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
    expect(await page.locator('a[href="/contact"]').isVisible()).toBe(true);
    expect(await page.locator('.browse-mobile-filter-panel').getAttribute('open')).not.toBeNull();
    expect(await page.locator('.footer-links-menu').getAttribute('open')).not.toBeNull();

    await page.close();
  });

  it('reveals browse and footer contents only after tapping their summaries on mobile', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(`${baseUrl}/test/responsive-browse`, { waitUntil: 'networkidle' });

    const search = page.locator('#search-q');
    const contact = page.locator('a[href="/contact"]');
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

    const footerSummary = page.locator('.footer-links-menu > summary');
    const footerSummaryBox = await footerSummary.boundingBox();
    expect(footerSummaryBox).not.toBeNull();
    if (footerSummaryBox) expect(footerSummaryBox.height).toBeGreaterThanOrEqual(44);

    await footerSummary.click();
    expect(await contact.isVisible()).toBe(true);
    const contactBox = await contact.boundingBox();
    expect(contactBox).not.toBeNull();
    if (contactBox) expect(contactBox.height).toBeGreaterThanOrEqual(44);

    await page.close();
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
