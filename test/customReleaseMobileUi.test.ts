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
    const content = releaseHtml.replace('<script src="/js/release-file-picker.js" defer></script>', '');
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
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
