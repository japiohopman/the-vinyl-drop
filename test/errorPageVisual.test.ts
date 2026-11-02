import fs from 'fs';
import path from 'path';
import { AddressInfo } from 'net';
import { Server } from 'http';
import express, { NextFunction, Request, Response } from 'express';
import { chromium, Browser } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';
import { errorHandler, notFoundHandler } from '../src/app/middleware/errorHandler';

jest.setTimeout(120_000);

describe('Branded 404 and 5xx error pages (#315)', () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    const publicDirectory = path.join(process.cwd(), 'public');

    app.set('views', path.join(process.cwd(), 'views'));
    app.set('view engine', 'ejs');
    app.locals.getIconSvg = getIconSvg;
    app.locals.versionedCssAssetUrl = (assetUrl: string) => `${assetUrl}?v=preview`;
    app.use(express.static(publicDirectory));
    app.use((req, res, next) => {
      res.locals.currentPath = req.path;
      res.locals.currentUser = null;
      res.locals.currentProfile = null;
      res.locals.messagingEnabled = false;
      res.locals.betaInviteOnly = false;
      res.locals.inviteOnlyAccessMessage = '';
      res.locals.showBetaWelcome = false;
      res.locals.flashMessages = [];
      res.locals.getIconSvg = getIconSvg;
      next();
    });
    app.get('/__error-preview/500', (_req: Request, _res: Response, next: NextFunction) => {
      const error = new Error('private provider diagnostics must never reach the page');
      next(error);
    });
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('renders accessible, overflow-free 404 and 5xx pages across supported viewport widths', async () => {
    const evidenceDirectory = process.env.ERROR_PAGE_EVIDENCE_DIR ||
      path.join(process.cwd(), 'artifacts', 'issue-315');
    fs.mkdirSync(evidenceDirectory, { recursive: true });

    const viewports = [360, 390, 430, 768, 1280];
    const routes = [
      { name: '404', path: '/__error-preview/not-found', status: 404, heading: "This record isn't here.", artwork: 'error-empty-sleeve.svg' },
      { name: '500', path: '/__error-preview/500?access_token=must-not-be-rendered', status: 500, heading: 'We hit a skip.', artwork: 'error-paused-turntable.svg' },
    ];

    for (const route of routes) {
      for (const width of viewports) {
        const page = await browser.newPage({
          viewport: { width, height: width < 768 ? 844 : 900 },
          deviceScaleFactor: 1,
        });
        try {
          const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
          expect(response?.status()).toBe(route.status);
          await page.locator('.status-page').waitFor({ state: 'visible' });
          await page.getByRole('heading', { level: 1, name: route.heading }).waitFor({ state: 'visible' });

          const layout = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            artworkWidth: (document.querySelector('.status-page-artwork img') as HTMLImageElement).naturalWidth,
            artworkComplete: (document.querySelector('.status-page-artwork img') as HTMLImageElement).complete,
          }));
          expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
          expect(layout.artworkComplete).toBe(true);
          expect(layout.artworkWidth).toBeGreaterThan(0);
          expect(await page.locator(`img[src*="${route.artwork}"]`).count()).toBe(1);
          expect(await page.locator('link[href*="/css/error-pages.css"]').count()).toBe(1);

          if (route.name === '500') {
            expect(await page.locator('.status-page').getAttribute('data-status-code')).toBe('500');
            expect(await page.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/__error-preview/500');
            expect(await page.locator('body').innerText()).not.toContain('access_token');
            expect(await page.locator('body').innerText()).not.toContain('private provider diagnostics');
          } else {
            expect(await page.getByRole('link', { name: 'Browse records' }).getAttribute('href')).toBe('/browse');
            expect(await page.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/');
          }

          if (width === 390 || width === 1280) {
            const screenshotName = `${route.name}-${width === 390 ? 'mobile' : 'desktop'}.png`;
            await page.screenshot({ path: path.join(evidenceDirectory, screenshotName), fullPage: true });
            const accessibility = await new AxeBuilder({ page })
              .include('.status-page')
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze();
            expect(accessibility.violations).toEqual([]);
          }
        } finally {
          await page.close();
        }
      }
    }
  });
});
