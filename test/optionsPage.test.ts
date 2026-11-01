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

  it('keeps disabled buttons and form controls legible in every theme', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(origin + '/options', { waitUntil: 'networkidle' });
      const results = await page.evaluate(() => {
        const button = document.createElement('button');
        button.className = 'btn btn-primary';
        button.disabled = true;
        button.textContent = 'Disabled action';
        document.body.append(button);

        const input = document.createElement('input');
        input.className = 'form-control';
        input.disabled = true;
        document.body.append(input);

        const luminance = (color: string) => {
          const values = color.match(/[0-9.]+/g)?.slice(0, 3).map(Number) || [];
          const linear = values.map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const contrast = (first: string, second: string) => {
          const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
          return (lighter + 0.05) / (darker + 0.05);
        };
        const read = (element: Element) => {
          const style = getComputedStyle(element);
          return {
            text: style.color,
            background: style.backgroundColor,
            border: style.borderTopColor,
            opacity: style.opacity,
          };
        };

        return ['record-shop', 'blue-note', 'soul-45', 'mint-press', 'midnight-groove', 'purple-haze'].map((theme) => {
          document.documentElement.setAttribute('data-theme', theme);
          const buttonColors = read(button);
          const inputColors = read(input);
          return {
            theme,
            buttonText: contrast(buttonColors.text, buttonColors.background),
            buttonBorder: contrast(buttonColors.border, buttonColors.background),
            inputText: contrast(inputColors.text, inputColors.background),
            inputBorder: contrast(inputColors.border, inputColors.background),
            buttonOpacity: buttonColors.opacity,
            inputOpacity: inputColors.opacity,
          };
        });
      });

      results.forEach((result) => {
        expect(result.buttonText).toBeGreaterThanOrEqual(4.5);
        expect(result.inputText).toBeGreaterThanOrEqual(4.5);
        expect(result.buttonBorder).toBeGreaterThanOrEqual(3);
        expect(result.inputBorder).toBeGreaterThanOrEqual(3);
        expect(result.buttonOpacity).toBe('1');
        expect(result.inputOpacity).toBe('1');
      });
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
