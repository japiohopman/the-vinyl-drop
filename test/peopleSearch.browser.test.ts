import { chromium, Browser } from 'playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../src/app';

jest.setTimeout(30_000);

describe('Public People search is deferred from the closed-beta release (#404)', () => {
  let server: Server;
  let baseUrl: string;
  let browser: Browser;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it.each([
    '/people',
    '/api/people-suggestions?q=crate',
    '/api/people-search?q=crate',
  ])('does not expose %s', async (route) => {
    const page = await browser.newPage();
    try {
      const response = await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(404);
    } finally {
      await page.close();
    }
  });
});
