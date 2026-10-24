import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Custom release mobile navigation and artwork picker', () => {
  jest.setTimeout(30000);

  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const releasePath = path.join(__dirname, '../views/releases/new.ejs');
  const stylesheetContent = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
  const pickerScript = fs.readFileSync(path.join(__dirname, '../public/js/release-file-picker.js'), 'utf8');
  const discogsLookupScript = fs.readFileSync(path.join(__dirname, '../public/js/discogs-release-lookup.js'), 'utf8');

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

  async function renderHeader(currentPath: string): Promise<string> {
    return ejs.renderFile(headerPath, {
      getIconSvg,
      currentPath,
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    }, { filename: headerPath }) as unknown as Promise<string>;
  }

  async function renderReleasePage(): Promise<string> {
    return ejs.renderFile(releasePath, {
      getIconSvg,
      form: {
        values: { format: 'LP' },
        fieldErrors: {},
        generalErrors: [],
      },
    }, { filename: releasePath }) as unknown as Promise<string>;
  }

  function documentHtml(headerHtml: string, releaseHtml: string): string {
    const content = releaseHtml
      .replace('<script src="/js/release-file-picker.js" defer></script>', '')
      .replace('<script src="/js/discogs-release-lookup.js" defer></script>', '');
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <base href="http://localhost/">
        <style>${stylesheetContent}</style>
      </head>
      <body>
        ${headerHtml}
        <main class="main-content container">${content}</main>
      </body>
      </html>`;
  }

  it('shows the current section in the mobile header and moves the custom-release back link into it', async () => {
    const digHeader = await renderHeader('/dig');
    expect(digHeader).toContain('<span class="mobile-context-heading">DIG</span>');
    expect(digHeader).not.toContain('mobile-dig-back');
    expect(digHeader).not.toContain('aria-label="Back to browse results"');

    const releaseHeader = await renderHeader('/releases/new');
    expect(releaseHeader).toContain('<span class="mobile-context-heading">DROP</span>');
    expect(releaseHeader).toContain('href="/drop/new"');
    expect(releaseHeader).toContain('class="mobile-context-back mobile-context-back-icon-only"');
    expect(releaseHeader).toContain('aria-label="Back to catalog search"');
    expect(releaseHeader).not.toContain('Back to catalog</span>');
    expect(releaseHeader).toContain('The Vinyl Drop Home');

    const dropStart = releaseHeader.indexOf('class="mobile-nav-item mobile-nav-drop');
    const dropLink = releaseHeader.slice(dropStart, releaseHeader.indexOf('</a>', dropStart) + 4);
    expect(dropLink).toContain('class="icon icon-plain-arrow"');
    expect(dropLink).not.toContain('icon-photo-camera');
    expect(dropLink).toContain('+ DROP');
  });

  it('fits About context labels and icon-only back targets on narrow mobile widths', async () => {
    const pages = [
      ['/terms', 'ABOUT / TERMS'],
      ['/contact', 'ABOUT / CONTACT'],
      ['/privacy', 'ABOUT / PRIVACY'],
      ['/community-rules', 'ABOUT / RULES'],
      ['/releases/new', 'DROP'],
    ] as const;

    for (const [route, label] of pages) {
      const headerHtml = await renderHeader(route);
      for (const width of [320, 360, 375, 414]) {
        await page.setViewportSize({ width, height: 740 });
        await page.setContent(`<!doctype html>
          <html lang="en"><head><meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${stylesheetContent}</style></head>
          <body>${headerHtml}</body></html>`);

        expect(await page.locator('.mobile-context-heading').textContent()).toBe(label);
        const back = page.locator('.mobile-context-back-icon-only');
        expect(await back.isVisible()).toBe(true);
        const box = await back.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        expect(dimensions.document).toBeLessThanOrEqual(width + 1);
        expect(dimensions.body).toBeLessThanOrEqual(width + 1);
      }
    }
  });

  it('provides an accessible camera action and announces the chosen artwork filename', async () => {
    const headerHtml = await renderHeader('/releases/new');
    const releaseHtml = await renderReleasePage();
    expect(releaseHtml).toContain('name="coverArt"');
    expect(releaseHtml).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(releaseHtml).toContain('id="releaseCoverArtFilename"');
    expect(releaseHtml).toContain('Use this device');
    expect(releaseHtml).toContain('class="icon icon-photo-camera"');

    await page.setViewportSize({ width: 375, height: 780 });
    await page.setContent(documentHtml(headerHtml, releaseHtml));
    await page.locator('#releaseMetadataDetails > summary').click();
    await page.addScriptTag({ content: pickerScript });

    expect(await page.locator('.custom-release-file-mobile-label').isVisible()).toBe(true);
    expect(await page.locator('.custom-release-file-desktop-label').isVisible()).toBe(false);
    expect(await page.locator('#releaseCoverArtFilename').getAttribute('role')).toBe('status');
    expect(await page.locator('#releaseCoverArtFilename').textContent()).toBe('No file selected');

    await page.locator('#releaseCoverArt').setInputFiles({
      name: 'test-cover.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('fake image bytes'),
    });
    expect(await page.locator('#releaseCoverArtFilename').textContent()).toBe('test-cover.webp');

    await page.setViewportSize({ width: 900, height: 780 });
    expect(await page.locator('.custom-release-file-mobile-label').isVisible()).toBe(false);
    expect(await page.locator('.custom-release-file-desktop-label').isVisible()).toBe(true);
  });

  it('fills editable release metadata after a debounced confident Discogs match', async () => {
    const headerHtml = await renderHeader('/drop/new');
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(documentHtml(headerHtml, releaseHtml));
    let lookupRequests = 0;
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      lookupRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: true,
          metadata: {
            label: 'Polydor',
            catalogueNumber: 'PD 123',
            releaseYear: '1970',
            format: 'Vinyl, LP, Album',
            barcode: '0123456789012',
            country: 'UK',
            genre: 'Funk, Soul',
            coverArtUrl: 'https://i.discogs.com/example-cover.jpg'
          }
        })
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });

    await page.locator('#releaseArtist').fill('James Brown');
    await page.locator('#releaseTitle').fill('Sex Machine');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'found',
      undefined,
      { timeout: 3000 }
    );

    expect(lookupRequests).toBe(1);
    expect(await page.locator('#releaseArtist').inputValue()).toBe('James Brown');
    expect(await page.locator('#releaseTitle').inputValue()).toBe('Sex Machine');
    expect(await page.locator('[name="label"]').inputValue()).toBe('Polydor');
    expect(await page.locator('[name="catalogueNumber"]').inputValue()).toBe('PD 123');
    expect(await page.locator('[name="releaseYear"]').inputValue()).toBe('1970');
    expect(await page.locator('[name="format"]').inputValue()).toBe('Vinyl, LP, Album');
    expect(await page.locator('[name="barcode"]').inputValue()).toBe('0123456789012');
    expect(await page.locator('[name="country"]').inputValue()).toBe('UK');
    expect(await page.locator('[name="genre"]').inputValue()).toBe('Funk, Soul');
    expect(await page.locator('#discogsCoverArtUrl').inputValue()).toBe('https://i.discogs.com/example-cover.jpg');
    expect(await page.locator('#discogsLookupStatus').getAttribute('role')).toBe('status');
    expect(await page.locator('#releaseMetadataDetails').getAttribute('open')).toBeNull();

    const dimensions = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(376);
    expect(dimensions.body).toBeLessThanOrEqual(376);
  });

  it('preserves manually corrected metadata when a later lookup runs', async () => {
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(documentHtml(await renderHeader('/drop/new'), releaseHtml));

    let lookupRequests = 0;
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      lookupRequests += 1;
      const metadata = lookupRequests === 1
        ? {
            label: 'Polydor',
            catalogueNumber: 'PD 123',
            releaseYear: '1970',
            format: 'Vinyl, LP, Album',
            barcode: '0123456789012',
            country: 'UK',
            genre: 'Funk, Soul',
            coverArtUrl: 'https://i.discogs.com/first-cover.jpg',
          }
        : {
            label: 'Replacement Label',
            catalogueNumber: 'PD 456',
            releaseYear: '1971',
            format: 'Vinyl, LP, Album',
            barcode: '9988776655443',
            country: 'US',
            genre: 'Funk',
            coverArtUrl: 'https://i.discogs.com/second-cover.jpg',
          };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ found: true, matchType: 'release', metadata }),
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });

    await page.locator('#releaseArtist').fill('James Brown');
    await page.locator('#releaseTitle').fill('Sex Machine');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'found',
      undefined,
      { timeout: 3000 }
    );
    expect(lookupRequests).toBe(1);

    await page.locator('#releaseMetadataDetails > summary').click();
    await page.locator('[name="label"]').fill('My corrected label');
    await page.locator('#releaseTitle').fill('Sex Machine edit');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'found',
      undefined,
      { timeout: 3000 }
    );

    expect(lookupRequests).toBe(2);
    expect(await page.locator('[name="label"]').inputValue()).toBe('My corrected label');
    expect(await page.locator('[name="catalogueNumber"]').inputValue()).toBe('PD 456');
    expect(await page.locator('[name="releaseYear"]').inputValue()).toBe('1971');
  });

  it('keeps manual entry available when lookup returns no match or a temporary error', async () => {
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 320, height: 760 });
    await page.setContent(documentHtml(await renderHeader('/drop/new'), releaseHtml));
    let responseStatus = 200;
    let responseBody: Record<string, unknown> = { found: false };
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      await route.fulfill({
        status: responseStatus,
        contentType: 'application/json',
        body: JSON.stringify(responseBody)
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });
    await page.locator('#releaseArtist').fill('Local artist');
    await page.locator('#releaseTitle').fill('Unindexed white label');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'empty',
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('#releaseArtist').inputValue()).toBe('Local artist');

    responseStatus = 503;
    responseBody = { error: 'Unavailable' };
    await page.locator('#releaseArtist').fill('Another artist');
    await page.locator('#releaseTitle').fill('Another title');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'error',
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('#releaseArtist').inputValue()).toBe('Another artist');
    expect(await page.locator('#releaseTitle').inputValue()).toBe('Another title');
    expect(await page.locator('#releaseMetadataDetails').isVisible()).toBe(true);
    const dimensions = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(321);
    expect(dimensions.body).toBeLessThanOrEqual(321);
  });

  it('prevents horizontal overflow and stacks metadata fields at narrow viewport sizes', async () => {
    const headerHtml = await renderHeader('/releases/new');
    const releaseHtml = await renderReleasePage();
    const html = documentHtml(headerHtml, releaseHtml);

    for (const width of [320, 360, 375, 414]) {
      await page.setViewportSize({ width, height: 820 });
      await page.setContent(html);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        columns: getComputedStyle(document.querySelector('.custom-release-grid') as Element).gridTemplateColumns,
      }));
      expect(dimensions.document).toBeLessThanOrEqual(width + 1);
      expect(dimensions.body).toBeLessThanOrEqual(width + 1);
      expect(dimensions.columns.split(' ').length).toBe(1);
    }
  });
});
