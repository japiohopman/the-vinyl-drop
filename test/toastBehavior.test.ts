import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Accessible toast browser behavior', () => {
  jest.setTimeout(30000);

  const flashTemplatePath = path.resolve(__dirname, '../views/partials/flash.ejs');
  const cssPath = path.resolve(__dirname, '../public/css/style.css');
  const scriptPath = path.resolve(__dirname, '../public/js/toast.js');
  const stylesheetContent = fs.readFileSync(cssPath, 'utf8');

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

  async function renderToastPage(): Promise<void> {
    const flashHtml = await ejs.renderFile(
      flashTemplatePath,
      {
        flashMessages: [{ type: 'success', message: 'Profile saved successfully.' }],
        getIconSvg,
      },
      { filename: flashTemplatePath }
    );

    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${stylesheetContent}</style>
        </head>
        <body>
          <header class="site-header">
            <div class="container header-container"></div>
          </header>
          <main>${flashHtml}</main>
        </body>
      </html>`);
  }

  it.each([
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 900 },
  ])('keeps the $name toast inside the viewport and below the sticky header', async ({ width, height }) => {
    await page.setViewportSize({ width, height });
    await renderToastPage();

    const toast = page.locator('.toast-container');
    const headerBox = await page.locator('.site-header').boundingBox();
    const toastBox = await toast.boundingBox();

    expect(headerBox).not.toBeNull();
    expect(toastBox).not.toBeNull();
    if (!headerBox || !toastBox) throw new Error('Expected header and toast container to be visible.');

    expect(toastBox.x).toBeGreaterThanOrEqual(0);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(width);
    expect(toastBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  });

  it('keeps the toast visible while its close control has keyboard focus, then resumes dismissal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderToastPage();
    const toast = page.locator('.toast');
    const closeButton = page.locator('[data-dismiss-toast]');
    await toast.evaluate((element) => element.setAttribute('data-dismiss-timeout', '180'));
    await page.addScriptTag({ path: scriptPath });

    await closeButton.focus();
    await page.waitForTimeout(300);
    await expectCount(toast, 1);

    await page.evaluate(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
    });
    await page.waitForFunction(() => document.querySelector('.toast') === null, { timeout: 1500 });
    await expectCount(toast, 0);
  });

  it('supports keyboard dismissal and reduced-motion preference', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderToastPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.toast').evaluate((element) => element.setAttribute('data-dismiss-timeout', '5000'));
    await page.addScriptTag({ path: scriptPath });

    const closeButton = page.locator('[data-dismiss-toast]');
    await closeButton.focus();
    await page.keyboard.press('Enter');

    await expectCount(page.locator('.toast'), 0);
  });
});

async function expectCount(locator: import('playwright').Locator, expected: number): Promise<void> {
  await locator.page().waitForFunction(
    ({ selector, count }) => document.querySelectorAll(selector).length === count,
    { selector: '.toast', count: expected },
    { timeout: 2000 }
  );
}
