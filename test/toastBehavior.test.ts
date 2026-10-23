/// <reference lib="dom" />

import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import { createApp } from '../src/app';
import { setFlashCookie } from '../src/app/middleware/flash';

jest.setTimeout(30000);

describe('Toast Behavior & Browser Interactions (Playwright)', () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });

    // Create Express app with test trigger route mounted before app router/notFoundHandler
    const testApp = express();
    testApp.get('/test/trigger-flash', (_req, res) => {
      setFlashCookie(res, 'success', 'Server confirmed success action!');
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

  it('renders a server-issued signed toast cleanly below the sticky header without overlap', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/test/trigger-flash`);

    const toast = page.locator('#toast-container .toast-success');
    await toast.waitFor({ state: 'visible', timeout: 5000 });

    const toastBox = await toast.boundingBox();
    const header = page.locator('.site-header');
    const headerBox = await header.boundingBox();

    expect(toastBox).not.toBeNull();
    expect(headerBox).not.toBeNull();

    if (toastBox && headerBox) {
      expect(toastBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    }

    await page.close();
  });

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

  it('pauses auto-dismiss timer on mouse hover and focus', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/test/trigger-flash`);

    const toast = page.locator('#toast-container .toast-success');
    await toast.waitFor({ state: 'visible', timeout: 5000 });

    // Hover over toast to pause timer
    await toast.hover();
    await page.waitForTimeout(2000);

    expect(await toast.isVisible()).toBe(true);

    // Unhover and wait for auto-dismiss
    await page.mouse.move(0, 0);
    await toast.waitFor({ state: 'detached', timeout: 6000 });

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
