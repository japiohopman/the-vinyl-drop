import { chromium, Browser, Page } from 'playwright';
import { AddressInfo } from 'net';
import { createApp } from '../src/app';

describe('Options page and live theme preferences', () => {
  jest.setTimeout(45000);

  const app = createApp();
  let browser: Browser;
  let server: ReturnType<typeof app.listen>;
  let origin: string;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    origin = 'http://127.0.0.1:' + address.port;
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('changes the whole page immediately, persists the choice and avoids horizontal overflow', async () => {
    const page: Page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(origin + '/options', { waitUntil: 'networkidle' });
      expect(await page.locator('h1').textContent()).toBe('Options');
      expect(await page.locator('html').getAttribute('data-theme')).toBe('record-shop');
      expect(await page.locator('[data-theme-choice]').count()).toBe(6);

      await page.locator('[data-theme-choice][value="midnight-groove"]').check();
      expect(await page.locator('html').getAttribute('data-theme')).toBe('midnight-groove');
      expect(await page.locator('body').evaluate((element) =>
        getComputedStyle(element).backgroundColor
      )).toBe('rgb(18, 26, 34)');

      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tvd:preferences:v1') || '{}'));
      expect(saved.theme).toBe('midnight-groove');

      await page.reload({ waitUntil: 'networkidle' });
      expect(await page.locator('html').getAttribute('data-theme')).toBe('midnight-groove');
      expect(await page.locator('[data-theme-choice][value="midnight-groove"]').isChecked()).toBe(true);

      for (const width of [360, 390, 430, 768, 1280]) {
        await page.setViewportSize({ width, height: 820 });
        const scrollWidth = await page.locator('html').evaluate((element) => element.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(width);
      }
    } finally {
      await page.close();
    }
  });

  it('shows haptic controls only when the browser exposes the Vibration API', async () => {
    const supportedPage = await browser.newPage();
    try {
      await supportedPage.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'vibrate', {
          configurable: true,
          value: () => true,
        });
      });
      await supportedPage.goto(origin + '/options', { waitUntil: 'networkidle' });
      expect(await supportedPage.locator('[data-haptics-setting]').isVisible()).toBe(true);

      await supportedPage.locator('#options-haptics').uncheck();
      await supportedPage.locator('#options-tutorials').uncheck();
      const saved = await supportedPage.evaluate(() => JSON.parse(localStorage.getItem('tvd:preferences:v1') || '{}'));
      expect(saved.hapticFeedbackEnabled).toBe(false);
      expect(saved.tutorialsEnabled).toBe(false);
      expect(saved.soundEffectsEnabled).toBe(true);
    } finally {
      await supportedPage.close();
    }

    const unsupportedPage = await browser.newPage();
    try {
      await unsupportedPage.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'vibrate', {
          configurable: true,
          value: undefined,
        });
      });
      await unsupportedPage.goto(origin + '/options', { waitUntil: 'networkidle' });
      expect(await unsupportedPage.locator('[data-haptics-setting]').isVisible()).toBe(false);
      expect(await unsupportedPage.locator('[data-haptics-unavailable]').isVisible()).toBe(true);
      expect(await unsupportedPage.locator('#options-sound').isVisible()).toBe(true);
    } finally {
      await unsupportedPage.close();
    }
  });
});
