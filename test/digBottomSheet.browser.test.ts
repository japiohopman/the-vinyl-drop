import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../src/app';
import * as listingService from '../src/app/services/listingService';

jest.mock('../src/app/services/listingService', () => ({
  ...jest.requireActual('../src/app/services/listingService'),
  hasExplicitWhiteLabelInventory: jest.fn(),
  searchBrowseListings: jest.fn(),
  searchDigListings: jest.fn(),
}));

jest.setTimeout(120_000);

describe('Dig desktop aside and mobile bottom sheet (Issue #419)', () => {
  let server: Server;
  let baseUrl: string;
  let browser: Browser;

  const sampleHouseRecord = {
    id: 'listing-house-1',
    title: 'Can You Feel It',
    artist: 'Mr. Fingers',
    releaseYear: 1986,
    format: '12-inch',
    priceFormatted: '€28.00',
    isTrade: false,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
    sellerUsername: 'larry_heard',
    sellerLocation: 'Chicago',
    url: '/listings/listing-house-1',
    imageUrl: '/assets/vinyl-placeholder.svg',
    frontArtwork: {
      src: '/assets/vinyl-placeholder.svg',
      altText: 'Can You Feel It front',
      sourceLabel: 'Placeholder',
      sourceKind: 'placeholder',
    },
    backArtwork: null,
    conditionSummary: 'Media VG+ · Sleeve VG',
  };

  beforeAll(async () => {
    (listingService.hasExplicitWhiteLabelInventory as jest.Mock).mockResolvedValue(true);
    (listingService.searchDigListings as jest.Mock).mockResolvedValue({
      items: [sampleHouseRecord],
      totalCount: 1,
      hasMore: false,
    });
    (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
      items: [sampleHouseRecord],
      totalCount: 1,
      page: 1,
      limit: 12,
      totalPages: 1,
    });

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
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  async function openDig(width: number, height: number, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.emulateMedia({ reducedMotion });
    await page.goto(`${baseUrl}/dig`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('dig-sidebar-enhanced'));
    return page;
  }

  async function waitForSidebarClosed(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const sidebar = document.querySelector('[data-dig-sidebar]');
      return sidebar instanceof HTMLElement && getComputedStyle(sidebar).visibility === 'hidden';
    });
  }

  it.each([
    { width: 320, height: 640 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ])('opens the mobile filter as a full-width bottom sheet at $width px and closes it downwards', async ({ width, height }) => {
    const page = await openDig(width, height);
    try {
      const trigger = page.locator('.dig-crate-toolbar [data-dig-drawer-open]');
      const sidebar = page.locator('[data-dig-sidebar]');

      expect(await trigger.isVisible()).toBe(true);
      expect(await sidebar.isVisible()).toBe(false);
      expect(await sidebar.getAttribute('aria-hidden')).toBe('true');
      expect(await sidebar.getAttribute('inert')).not.toBeNull();

      const closedState = await sidebar.evaluate((element) => {
        const style = getComputedStyle(element);
        return { visibility: style.visibility, transform: style.transform };
      });
      expect(closedState.visibility).toBe('hidden');

      await trigger.click();
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-dig-sidebar]');
        if (!(element instanceof HTMLElement) || !element.classList.contains('is-drawer-open')) return false;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return Math.abs(matrix.m42) < 1;
      });

      const geometry = await sidebar.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          translateY: matrix.m42,
          role: element.getAttribute('role'),
          modal: element.getAttribute('aria-modal'),
          overflowY: getComputedStyle(element).overflowY,
        };
      });

      expect(geometry.left).toBeCloseTo(0, 0);
      expect(geometry.right).toBeCloseTo(width, 0);
      expect(Math.abs(geometry.bottom - height)).toBeLessThanOrEqual(1);
      expect(geometry.top).toBeGreaterThan(0);
      expect(geometry.width).toBeCloseTo(width, 0);
      expect(geometry.height).toBeLessThanOrEqual(height * 0.84 + 1);
      expect(Math.abs(geometry.translateY)).toBeLessThan(1);
      expect(geometry.role).toBe('dialog');
      expect(geometry.modal).toBe('true');
      expect(geometry.overflowY).toBe('auto');
      expect(await page.locator('.dig-drawer-backdrop').isVisible()).toBe(true);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(60);
      const closingTranslateY = await sidebar.evaluate((element) =>
        new DOMMatrixReadOnly(getComputedStyle(element).transform).m42
      );
      expect(closingTranslateY).toBeGreaterThan(0);
      await waitForSidebarClosed(page);
      expect(await page.evaluate(() => document.activeElement?.matches('.dig-crate-toolbar [data-dig-drawer-open]'))).toBe(true);
      expect(await sidebar.getAttribute('aria-modal')).toBeNull();
    } finally {
      await page.close();
    }
  });

  it('closes the mobile bottom sheet when the backdrop is pressed', async () => {
    const page = await openDig(390, 844);
    try {
      await page.locator('.dig-crate-toolbar [data-dig-drawer-open]').click();
      await page.locator('.dig-drawer-backdrop').click({ position: { x: 12, y: 12 } });
      await waitForSidebarClosed(page);
      expect(await page.locator('[data-dig-sidebar]').getAttribute('role')).toBeNull();
    } finally {
      await page.close();
    }
  });

  it('keeps the tablet drawer sliding in from the side', async () => {
    const page = await openDig(768, 900);
    try {
      const trigger = page.locator('.dig-search-control-bar [data-dig-drawer-open]');
      const sidebar = page.locator('[data-dig-sidebar]');
      expect(await trigger.isVisible()).toBe(true);

      await trigger.click();
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-dig-sidebar]');
        if (!(element instanceof HTMLElement) || !element.classList.contains('is-drawer-open')) return false;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return Math.abs(matrix.m41) < 1;
      });

      const geometry = await sidebar.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, width: rect.width, bottom: rect.bottom };
      });
      expect(geometry.left).toBeCloseTo(0, 0);
      expect(geometry.width).toBeLessThanOrEqual(360);
      expect(geometry.bottom).toBeCloseTo(900, 0);
      await page.keyboard.press('Escape');
      await sidebar.waitFor({ state: 'hidden' });
    } finally {
      await page.close();
    }
  });

  it('restores desktop sidebar focusability after resizing from a closed phone sheet', async () => {
    const page = await openDig(390, 844);
    try {
      const sidebar = page.locator('[data-dig-sidebar]');
      expect(await sidebar.getAttribute('aria-hidden')).toBe('true');
      expect(await sidebar.getAttribute('inert')).not.toBeNull();

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-dig-sidebar]');
        return window.matchMedia('(min-width: 1024px)').matches &&
          element instanceof HTMLElement &&
          !element.hasAttribute('aria-hidden') &&
          !element.hasAttribute('inert');
      });

      expect(await sidebar.isVisible()).toBe(true);
      const desktopFilter = sidebar.locator('select').first();
      expect(await desktopFilter.isVisible()).toBe(true);
      await desktopFilter.focus();
      expect(await desktopFilter.evaluate((element) => document.activeElement === element)).toBe(true);
    } finally {
      await page.close();
    }
  });

  it.each([1024, 1280, 1440])('keeps a composed left-hand aside and results workspace at %i px', async (width) => {
    const page = await openDig(width, 900);
    try {
      const metrics = await page.evaluate(() => {
        const sidebar = document.querySelector('.dig-sidebar');
        const sidebarInner = document.querySelector('.dig-sidebar-inner');
        const sidebarHeader = document.querySelector('.dig-sidebar-header');
        const filterForm = document.querySelector('.dig-sidebar .dig-filter-form');
        const results = document.querySelector('.dig-responsive-desktop');
        const pageShell = document.querySelector('.dig-responsive-page');
        const searchIcon = document.querySelector('.dig-primary-search-form .form-search-control svg');
        if (!(sidebar instanceof HTMLElement) || !(sidebarInner instanceof HTMLElement) ||
            !(sidebarHeader instanceof HTMLElement) || !(filterForm instanceof HTMLElement) ||
            !(results instanceof HTMLElement) || !(pageShell instanceof HTMLElement)) return null;
        const asideRect = sidebar.getBoundingClientRect();
        const resultsRect = results.getBoundingClientRect();
        const styles = getComputedStyle(sidebarInner);
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          asideLeft: asideRect.left,
          asideRight: asideRect.right,
          asideTop: asideRect.top,
          resultsLeft: resultsRect.left,
          resultsTop: resultsRect.top,
          headerDisplay: getComputedStyle(sidebarHeader).display,
          innerBorder: styles.borderTopWidth,
          innerShadow: styles.boxShadow,
          filterFormBorder: getComputedStyle(filterForm).borderTopWidth,
          filterFormShadow: getComputedStyle(filterForm).boxShadow,
          filterFormBackground: getComputedStyle(filterForm).backgroundColor,
          filterFormPadding: getComputedStyle(filterForm).paddingTop,
          searchIconCount: searchIcon ? 1 : 0,
          columnGap: getComputedStyle(pageShell).columnGap,
        };
      });

      expect(metrics).not.toBeNull();
      if (!metrics) return;
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.asideLeft).toBeLessThan(metrics.resultsLeft);
      expect(metrics.asideRight).toBeLessThan(metrics.resultsLeft);
      expect(Math.abs(metrics.asideTop - metrics.resultsTop)).toBeLessThan(48);
      expect(metrics.headerDisplay).toBe('flex');
      expect(metrics.innerBorder).toBe('0px');
      expect(metrics.innerShadow).toBe('none');
      expect(metrics.filterFormBorder).toBe('0px');
      expect(metrics.filterFormShadow).toBe('none');
      expect(metrics.filterFormBackground).toBe('rgba(0, 0, 0, 0)');
      expect(metrics.filterFormPadding).toBe('0px');
      expect(metrics.searchIconCount).toBe(1);
      expect(metrics.columnGap).not.toBe('normal');
    } finally {
      await page.close();
    }
  });

  it('places a decorative search icon inside the mobile sidebar query field', async () => {
    const page = await openDig(390, 844);
    try {
      const search = page.locator('#dig-filter-query');
      await page.locator('.dig-crate-toolbar [data-dig-drawer-open]').click();
      expect(await search.isVisible()).toBe(true);

      const iconStyle = await page.locator('.dig-filter-query-control').evaluate((element) => {
        const input = element.querySelector('input[type="search"]');
        const icon = getComputedStyle(element, '::after');
        if (!(input instanceof HTMLInputElement)) return null;
        return {
          paddingLeft: Number.parseFloat(getComputedStyle(input).paddingLeft),
          maskImage: icon.maskImage,
          webkitMaskImage: (icon as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage,
          pointerEvents: icon.pointerEvents,
          label: element.querySelector('label')?.textContent?.trim(),
        };
      });

      expect(iconStyle).not.toBeNull();
      if (!iconStyle) return;
      expect(iconStyle.paddingLeft).toBeGreaterThanOrEqual(40);
      expect((iconStyle.maskImage + ' ' + iconStyle.webkitMaskImage)).toContain('/assets/svg/search.svg');
      expect(iconStyle.pointerEvents).toBe('none');
      expect(iconStyle.label).toBe('Search records');
    } finally {
      await page.close();
    }
  });

  it('removes bottom-sheet movement when reduced motion is requested', async () => {
    const page = await openDig(390, 844, 'reduce');
    try {
      const sidebar = page.locator('[data-dig-sidebar]');
      await page.locator('.dig-crate-toolbar [data-dig-drawer-open]').click();

      const transitionDuration = await sidebar.evaluate((element) =>
        getComputedStyle(element).transitionDuration.split(',').map((duration) => duration.trim())
      );
      expect(transitionDuration.every((duration) => Number.parseFloat(duration) === 0)).toBe(true);
      expect(await sidebar.getAttribute('aria-modal')).toBe('true');
    } finally {
      await page.close();
    }
  });

  it('captures diagnostic mobile sheet and desktop aside screenshots for owner review', async () => {
    const evidenceDirectory = process.env.ISSUE_419_EVIDENCE_DIR?.trim();
    if (!evidenceDirectory) return;

    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const manifest: Array<{
      file: string;
      route: string;
      viewport: string;
      state: string;
      theme: string;
      sourceSha: string | null;
      baselineStatus: string;
    }> = [];

    const mobilePage = await openDig(390, 844);
    try {
      const closedFile = 'dig-mobile-390x844-closed.png';
      await mobilePage.screenshot({
        path: path.join(evidenceDirectory, closedFile),
        fullPage: false,
        animations: 'disabled',
      });
      manifest.push({
        file: closedFile,
        route: '/dig',
        viewport: '390x844',
        state: 'crate view with filter sheet closed',
        theme: 'default',
        sourceSha: process.env.GITHUB_SHA || null,
        baselineStatus: 'diagnostic; pending owner review',
      });

      await mobilePage.locator('.dig-crate-toolbar [data-dig-drawer-open]').click();
      await mobilePage.waitForFunction(() => {
        const element = document.querySelector('[data-dig-sidebar]');
        if (!(element instanceof HTMLElement) || !element.classList.contains('is-drawer-open')) return false;
        return Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42) < 1;
      });

      const openFile = 'dig-mobile-390x844-filter-sheet-open.png';
      await mobilePage.screenshot({
        path: path.join(evidenceDirectory, openFile),
        fullPage: false,
        animations: 'disabled',
      });
      manifest.push({
        file: openFile,
        route: '/dig',
        viewport: '390x844',
        state: 'filter bottom sheet open',
        theme: 'default',
        sourceSha: process.env.GITHUB_SHA || null,
        baselineStatus: 'diagnostic; pending owner review',
      });
    } finally {
      await mobilePage.close();
    }

    const desktopPage = await openDig(1440, 900);
    try {
      const desktopFile = 'dig-desktop-1440x900-aside.png';
      await desktopPage.screenshot({
        path: path.join(evidenceDirectory, desktopFile),
        fullPage: true,
        animations: 'disabled',
      });
      manifest.push({
        file: desktopFile,
        route: '/dig',
        viewport: '1440x900',
        state: 'desktop results with persistent left-hand aside',
        theme: 'default',
        sourceSha: process.env.GITHUB_SHA || null,
        baselineStatus: 'diagnostic; pending owner review',
      });
    } finally {
      await desktopPage.close();
    }

    fs.writeFileSync(
      path.join(evidenceDirectory, 'metadata.json'),
      JSON.stringify({ issue: 419, captures: manifest }, null, 2) + '\n',
      'utf8'
    );
  });

});