import { Browser, chromium, devices, webkit } from '@playwright/test';
import { Server } from 'http';
import { createApp } from '../src/app';

jest.mock('../src/app/services/listingService', () => {
  const actual = jest.requireActual('../src/app/services/listingService');
  return {
    ...actual,
    getHomeFeedListings: jest.fn().mockResolvedValue([]),
    getHomeDiscoveryListings: jest.fn().mockResolvedValue([]),
  };
});

jest.setTimeout(120_000);

describe('PWA browser smoke tests — Issue #52', () => {
  let server: Server;
  let baseUrl: string;
  let chromiumBrowser!: Browser;
  let webkitBrowser!: Browser;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the local Express test server address.');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    [chromiumBrowser, webkitBrowser] = await Promise.all([
      chromium.launch({ headless: true }),
      webkit.launch({ headless: true }),
    ]);
  }, 120_000);

  afterAll(async () => {
    if (chromiumBrowser) await chromiumBrowser.close();
    if (webkitBrowser) await webkitBrowser.close();

    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }, 30_000);

  it('keeps the install page within the 360, 390, 768 and 1280px Chromium viewports', async () => {
    const context = await chromiumBrowser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.setViewportSize({ width: 360, height: 900 });
      await page.goto(`${baseUrl}/install`, { waitUntil: 'domcontentloaded' });
      expect(await page.locator('#install-title').textContent()).toContain('Take The Vinyl Drop with you.');

      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));

        expect(dimensions.viewport).toBe(width);
        expect(dimensions.document).toBeLessThanOrEqual(width);
        expect(dimensions.body).toBeLessThanOrEqual(width);
      }
    } finally {
      await context.close();
    }
  });

  it('makes the install guide discoverable from Home and the mobile Me → About menu', async () => {
    const context = await chromiumBrowser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });

      const homeInstallLink = page.getByRole('link', { name: 'Install The Vinyl Drop' });
      expect(await homeInstallLink.isVisible()).toBe(true);
      expect(await homeInstallLink.getAttribute('href')).toBe('/install');
      expect(await page.locator('.footer-links a[href="/install"]').count()).toBe(1);

      for (const width of [360, 390, 430, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = await homeInstallLink.boundingBox();
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));

        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(dimensions.viewport).toBe(width);
        expect(dimensions.document).toBeLessThanOrEqual(width);
        expect(dimensions.body).toBeLessThanOrEqual(width);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#mobile-you-trigger').click();
      await page.locator('#mobile-you-about-trigger').click();

      const aboutInstallLink = page.locator('#mobile-you-about-view a[href="/install"]');
      expect(await aboutInstallLink.isVisible()).toBe(true);
      expect(await aboutInstallLink.textContent()).toBe('Install The Vinyl Drop');

      await aboutInstallLink.click();
      await page.waitForURL(`${baseUrl}/install`);
      expect(await page.locator('#install-title').isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('uses the native device share callback and sends the server-provided canonical URL', async () => {
    const context = await chromiumBrowser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: unknown) => {
          (window as Window & { __tvdSharedData?: { url?: string } }).__tvdSharedData =
            data as { url?: string };
        },
      });
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}/install`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Share this page' }).click();

      const shared = await page.evaluate(() => (
        window as Window & { __tvdSharedData?: { url?: string } }
      ).__tvdSharedData);

      expect(shared?.url).toBe('https://thevinyldrop.nl/install');
      expect(await page.locator('[data-install-status]').textContent())
        .toContain('Choose WhatsApp, email or another app');
      expect(await page.locator('[data-copy-fallback]').isHidden()).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('shows a selectable copy-link fallback when native share and clipboard APIs are unavailable', async () => {
    const context = await chromiumBrowser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}/install`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Copy install link' }).click();

      expect(await page.locator('[data-copy-fallback]').isVisible()).toBe(true);
      expect(await page.locator('[data-install-share-url]').inputValue())
        .toBe('https://thevinyldrop.nl/install');
      expect(await page.locator('[data-install-status]').textContent()).toContain('link');
    } finally {
      await context.close();
    }
  });

  it('only exposes the install prompt after beforeinstallprompt is received', async () => {
    const context = await chromiumBrowser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}/install`, { waitUntil: 'domcontentloaded' });
      const installButton = page.locator('[data-install-action]');
      expect(await installButton.isHidden()).toBe(true);

      const prevented = await page.evaluate(() => {
        const promptEvent = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(promptEvent, {
          prompt: async () => {
            (window as Window & { __tvdPromptCalled?: boolean }).__tvdPromptCalled = true;
          },
          userChoice: Promise.resolve({ outcome: 'accepted' }),
        });
        window.dispatchEvent(promptEvent);
        return promptEvent.defaultPrevented;
      });

      expect(prevented).toBe(true);
      expect(await installButton.isVisible()).toBe(true);
      await installButton.click();
      expect(await page.locator('[data-install-status]').textContent())
        .toContain('is being installed');
      expect(await page.evaluate(() => (
        window as Window & { __tvdPromptCalled?: boolean }
      ).__tvdPromptCalled)).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('renders the iPhone-sized Safari/WebKit layout and keeps the iOS Add to Home Screen path visible', async () => {
    const context = await webkitBrowser.newContext({
      ...devices['iPhone 13'],
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}/install`, { waitUntil: 'domcontentloaded' });
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));

      expect(dimensions.viewport).toBe(390);
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
      expect(await page.locator('h3').allTextContents()).toContain('iPhone or iPad');
      expect(await page.getByText('Add to Home Screen', { exact: false }).count()).toBeGreaterThan(0);
      expect(await page.locator('[data-share-action]').isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  });
});
