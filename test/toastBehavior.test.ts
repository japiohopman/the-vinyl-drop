/// <reference lib="dom" />

import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import { createApp } from '../src/app';
import { setFlashCookie } from '../src/app/middleware/flash';

jest.setTimeout(45000);

describe('Toast Behavior & Browser Interactions (Playwright)', () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });

    const testApp = express();
    testApp.get('/test/trigger-flash', (_req, res) => {
      setFlashCookie(res, 'success', 'Server confirmed success action!');
      res.redirect('/design-system');
    });
    testApp.get('/test/trigger-info-flash', (_req, res) => {
      setFlashCookie(res, 'info', 'Server info notification!');
      res.redirect('/design-system');
    });
    testApp.use(createApp());

    server = testApp.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (browser) {
      await browser.close();
    }
  });

  const viewports = [
    { width: 360, height: 740, name: '360px Small Mobile' },
    { width: 390, height: 844, name: '390px Mobile' },
    { width: 430, height: 932, name: '430px Large Mobile' },
    { width: 768, height: 1024, name: '768px Tablet Layout Breakpoint' },
    { width: 1280, height: 800, name: '1280px Desktop' },
  ];

  for (const vp of viewports) {
    it(`renders a server-issued toast cleanly below the sticky header without overlap at ${vp.name} (${vp.width}px)`, async () => {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`${baseUrl}/test/trigger-flash`);

      const toast = page.locator('#toast-container .toast-success');
      await toast.waitFor({ state: 'visible', timeout: 5000 });

      const toastBox = await toast.boundingBox();
      const header = page.locator('.site-header');
      const headerBox = await header.boundingBox();

      expect(toastBox).not.toBeNull();
      expect(headerBox).not.toBeNull();

      if (toastBox && headerBox) {
        expect(toastBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
        expect(toastBox.x).toBeGreaterThanOrEqual(0);
        expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(vp.width);
        expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(vp.height);
      }

      await page.close();
    });
  }

  it('allows manual dismissal when clicking the close button', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/test/trigger-flash`);

    const toast = page.locator('#toast-container .toast-success');
    await toast.waitFor({ state: 'visible', timeout: 5000 });

    const closeBtn = page.locator('#toast-container .toast-success .toast-close');
    await closeBtn.click();

    await toast.waitFor({ state: 'detached', timeout: 3000 });
    const count = await page.locator('#toast-container .toast-success').count();
    expect(count).toBe(0);

    await page.close();
  });

  it('pauses auto-dismiss timer on mouse hover and resumes after mouseleave', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/test/trigger-flash`);

    const toast = page.locator('#toast-container .toast-success');
    await toast.waitFor({ state: 'visible', timeout: 5000 });

    await toast.hover();
    await page.waitForTimeout(2000);

    expect(await toast.isVisible()).toBe(true);

    await page.mouse.move(0, 0);
    await toast.waitFor({ state: 'detached', timeout: 6000 });

    await page.close();
  });

  it('pauses auto-dismiss timer on keyboard focusin and resumes after focusout', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/test/trigger-flash`);

    const toast = page.locator('#toast-container .toast-success');
    await toast.waitFor({ state: 'visible', timeout: 5000 });

    const closeBtn = page.locator('#toast-container .toast-success .toast-close');
    await closeBtn.focus();
    await page.waitForTimeout(2000);

    expect(await toast.isVisible()).toBe(true);

    // Blur focus away from toast
    await closeBtn.evaluate((el) => (el as HTMLElement).blur());
    await toast.waitFor({ state: 'detached', timeout: 6000 });

    await page.close();
  });

  it('keeps the timer paused after hover ends while keyboard focus remains inside the toast', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/test/trigger-flash`);

    const toast = page.locator('#toast-container .toast-success');
    await toast.waitFor({ state: 'visible', timeout: 5000 });
    const closeBtn = page.locator('#toast-container .toast-success .toast-close');

    await toast.hover();
    await closeBtn.focus();
    await page.waitForTimeout(2000);
    expect(await toast.isVisible()).toBe(true);

    // Leaving with the pointer must not restart the timer while keyboard focus remains.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(1500);
    expect(await toast.isVisible()).toBe(true);

    await closeBtn.evaluate((el) => (el as HTMLElement).blur());
    await toast.waitFor({ state: 'detached', timeout: 6000 });
    await page.close();
  });

  it('auto-dismisses info toasts initialized with data-auto-dismiss="true"', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/test/trigger-info-flash`);

    const toast = page.locator('#toast-container .toast-info');
    await toast.waitFor({ state: 'visible', timeout: 5000 });

    await toast.waitFor({ state: 'detached', timeout: 6000 });

    await page.close();
  });

  it('respects prefers-reduced-motion by removing toast immediately on dismiss', async () => {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/test/trigger-flash`);

    const toast = page.locator('#toast-container .toast-success');
    await toast.waitFor({ state: 'visible', timeout: 5000 });

    const closeBtn = page.locator('#toast-container .toast-success .toast-close');
    await closeBtn.click();

    // Immediately detached without 300ms transition class delay
    const count = await page.locator('#toast-container .toast-success').count();
    expect(count).toBe(0);

    await page.close();
  });

  it('does NOT render fabricated success toast or error banner from unverified URL query params', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/design-system?success=FabricatedSuccess&error=FabricatedError`);

    await page.waitForTimeout(500);

    const toasts = await page.locator('#toast-container .toast-message').allInnerTexts();
    expect(toasts.some((t) => t.includes('FabricatedSuccess'))).toBe(false);

    const errors = await page.locator('.flash-error-list').allInnerTexts();
    expect(errors.some((e) => e.includes('FabricatedError'))).toBe(false);

    await page.close();
  });
});
