/// <reference lib="dom" />
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Mobile Dig app-like viewport', () => {
  jest.setTimeout(30000);

  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const digPath = path.join(__dirname, '../views/browse/responsive-dig.ejs');
  const css = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
  const digState = fs.readFileSync(path.join(__dirname, '../public/js/dig-state.js'), 'utf8');
  const digMode = fs.readFileSync(path.join(__dirname, '../public/js/dig-mode.js'), 'utf8');
  let browser: Browser;
  let page: Page;

  const filters = {
    q: 'De La Soul',
    genre: 'Hip Hop',
    condition: 'VG+',
    minPrice: '10.00',
    maxPrice: '50.00',
    sort: 'price_asc',
    formats: ['LP', '7-inch'],
    whiteLabel: true,
    view: 'grid',
  };

  const makeItem = (id: string, title: string, year: number, price: string) => ({
    id,
    title,
    artist: 'De La Soul',
    releaseYear: year,
    format: 'Vinyl, LP, Album',
    priceFormatted: price,
    isTrade: false,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
    sellerUsername: 'crate_digger',
    sellerLocation: 'Amsterdam',
    url: '/listings/' + id,
    frontArtwork: {
      src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      altText: 'Front cover of the physical sleeve for ' + title,
      sourceLabel: 'Seller photo of the physical front cover',
      sourceKind: 'seller_front',
    },
    backArtwork: null,
    conditionSummary: 'Media VG+ · sleeve VG',
  });
  const items = [
    makeItem('listing-1', '3 Feet High and Rising', 1989, '€20.00'),
    makeItem('listing-2', 'Buhloone Mindstate', 1993, '€18.00'),
  ];

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  async function renderPage(): Promise<string> {
    const locals = {
      getIconSvg,
      currentPath: '/dig',
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
      title: 'Dig — The Vinyl Drop',
      items,
      totalCount: 28,
      hasMore: false,
      filters,
      listings: [],
      formatOptions: [{ value: 'LP', label: 'LP', description: 'Long-play records' }],
      whiteLabelAvailable: true,
      pagination: { page: 2, limit: 12, totalCount: 28, totalPages: 3 },
      errorMessage: null,
    };
    const results = await Promise.all([
      ejs.renderFile(headerPath, locals, { filename: headerPath }),
      ejs.renderFile(digPath, locals, { filename: digPath }),
    ]);
    const headerHtml = results[0];
    const digHtml = results[1];
    const bodyContent = digHtml
      .replace('<script src="/js/dig-state.js" defer></script>', '')
      .replace('<script src="/js/dig-mode.js" defer></script>', '');
    return '<!doctype html><html lang="en"><head>' +
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<style>' + css + '</style></head>' +
      '<body class="mobile-dig-session">' + headerHtml +
      '<main class="main-content container">' + bodyContent + '</main></body></html>';
  }

  async function loadPage(width: number, height: number): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.setContent(await renderPage());
    await page.addScriptTag({ content: digState });
    await page.addScriptTag({ content: digMode });
  }

  it('keeps the live session counter in the mobile header without a Dig back link', async () => {
    await loadPage(375, 812);
    expect(await page.locator('.mobile-context-heading').textContent()).toBe('DIG');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
    expect(await page.locator('[data-dig-header-position]').getAttribute('aria-live')).toBe('polite');
    expect(await page.locator('.mobile-dig-back').count()).toBe(0);
    expect(await page.locator('.mobile-context-back').count()).toBe(0);

    const heading = await page.locator('.dig-page-header').boundingBox();
    expect(heading).not.toBeNull();
    expect(heading!.width).toBeLessThanOrEqual(1);
    expect(await page.locator('.dig-page-header h1').count()).toBe(1);
  });

  it('updates the nav counter when moving to the next record', async () => {
    await loadPage(375, 812);
    await page.locator('[data-dig-viewer]').focus();
    await page.keyboard.press('ArrowUp');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
  });

  it('fits the active sleeve in the mobile viewport without page-level scrolling', async () => {
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 360, height: 740 },
      { width: 375, height: 812 },
      { width: 414, height: 896 },
      { width: 430, height: 932 },
    ]) {
      await loadPage(viewport.width, viewport.height);
      const dimensions = await page.evaluate(() => {
        const stage = document.querySelector('.dig-sleeve-stage') as HTMLElement | null;
        const rect = stage ? stage.getBoundingClientRect() : null;
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          bodyWidth: document.body.scrollWidth,
          bodyHeight: document.body.scrollHeight,
          stageWidth: rect ? rect.width : 0,
          stageBottom: rect ? rect.bottom : 0,
        };
      });
      expect(dimensions.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.documentHeight).toBeLessThanOrEqual(viewport.height);
      expect(dimensions.bodyHeight).toBeLessThanOrEqual(viewport.height);
      expect(dimensions.stageWidth).toBeGreaterThanOrEqual(viewport.width - 48);
      expect(dimensions.stageBottom).toBeLessThanOrEqual(viewport.height - 60 + 1);
    }
  });

  async function swipeActive(deltaX: number, deltaY: number): Promise<void> {
    const stage = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const box = await stage.boundingBox();
    if (!box) throw new Error('Active Dig sleeve has no bounding box');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(620);
  }

  it('shows one square face-on sleeve with no tilted plane or other album cover at rest', async () => {
    await loadPage(375, 812);
    const state = await page.evaluate(() => {
      const slides = Array.from(document.querySelectorAll<HTMLElement>('[data-dig-slide]'));
      const active = slides.find((slide) => slide.classList.contains('is-active'));
      const stage = active?.querySelector<HTMLElement>('[data-dig-swipe-area]');
      const card = active?.querySelector<HTMLElement>('[data-dig-sleeve-card]');
      const rect = stage?.getBoundingClientRect();
      return {
        visibleSlides: slides.filter((slide) => getComputedStyle(slide).visibility === 'visible').length,
        activeCount: slides.filter((slide) => slide.classList.contains('is-active')).length,
        planeCount: document.querySelectorAll('[data-dig-sleeve-plane]').length,
        cardTransform: card ? getComputedStyle(card).transform : 'missing',
        stageAspectRatio: rect ? rect.width / rect.height : 0,
        activeTitleOpacity: active ? getComputedStyle(active.querySelector('.dig-listing-meta')!).opacity : 'missing',
        activePriceOpacity: active ? getComputedStyle(active.querySelector('.dig-card-actions')!).opacity : 'missing',
      };
    });

    expect(state.visibleSlides).toBe(1);
    expect(state.activeCount).toBe(1);
    expect(state.planeCount).toBe(0);
    expect(state.cardTransform).toBe('none');
    expect(state.stageAspectRatio).toBeGreaterThan(0.97);
    expect(state.stageAspectRatio).toBeLessThan(1.03);
    expect(Number(state.activeTitleOpacity)).toBe(1);
    expect(Number(state.activePriceOpacity)).toBe(1);
    const flipControlStyle = await page.locator('[data-dig-slide].is-active [data-dig-flip]').evaluate((element) => {
      const style = getComputedStyle(element);
      return { position: style.position, width: style.width, height: style.height, clip: style.clip };
    });
    expect(flipControlStyle.position).toBe('absolute');
    expect(flipControlStyle.width).toBe('1px');
    expect(flipControlStyle.height).toBe('1px');
    expect(flipControlStyle.clip).not.toBe('auto');
  });

  it('flips the same album on a horizontal finger swipe without changing the record index', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);
    const initialLabel = await page.locator('[data-dig-slide].is-active').getAttribute('aria-label');

    await swipeActive(-110, 0);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toBe(initialLabel);
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(true);
    expect(await page.locator('[data-dig-slide].is-active .dig-sleeve-face-front').getAttribute('aria-hidden')).toBe('true');
    expect(await page.locator('[data-dig-slide].is-active .dig-sleeve-face-back').getAttribute('aria-hidden')).toBe('false');

    await swipeActive(110, 0);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toBe(initialLabel);
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(false);
    expect(await page.locator('[data-dig-slide]:visible').count()).toBe(1);
  });

  it('follows a real 3D deck arc during vertical drag, then settles the incoming record face-on', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);

    const stage = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const box = await stage.boundingBox();
    if (!box) throw new Error('Active Dig sleeve has no bounding box');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 110, { steps: 8 });

    const duringDrag = await page.evaluate(() => {
      const slides = Array.from(document.querySelectorAll<HTMLElement>('[data-dig-slide]'));
      const active = slides.find((slide) => slide.classList.contains('is-active'))!;
      const incoming = slides.find((slide) => slide !== active)!;
      return {
        outgoingTransform: active.querySelector<HTMLElement>('.dig-sleeve-interaction')!.style.transform,
        incomingTransform: incoming.querySelector<HTMLElement>('.dig-sleeve-interaction')!.style.transform,
        incomingVisibility: getComputedStyle(incoming).visibility,
        outgoingMetaOpacity: Number(active.querySelector<HTMLElement>('.dig-listing-meta')!.style.opacity),
        incomingMetaOpacity: Number(incoming.querySelector<HTMLElement>('.dig-listing-meta')!.style.opacity),
      };
    });

    expect(duringDrag.outgoingTransform).toContain('rotateX(');
    expect(duringDrag.incomingTransform).toContain('translate3d(');
    expect(duringDrag.incomingTransform).toContain('rotateX(');
    expect(duringDrag.outgoingTransform).not.toContain('scale(');
    expect(duringDrag.incomingTransform).not.toContain('scale(');
    expect(duringDrag.incomingVisibility).toBe('visible');
    expect(duringDrag.outgoingMetaOpacity).toBeLessThan(1);
    expect(duringDrag.incomingMetaOpacity).toBeGreaterThan(0);

    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toContain('Buhloone Mindstate');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
    expect(await page.locator('[data-dig-slide]:visible').count()).toBe(1);

    const restingRotation = await page.locator('[data-dig-slide].is-active').evaluate((slide) => {
      const sleeve = slide.querySelector<HTMLElement>('.dig-sleeve-interaction')!;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(sleeve).transform);
      return Math.abs(Math.atan2(matrix.m32, matrix.m33) * 180 / Math.PI);
    });
    expect(restingRotation).toBeLessThan(1);
  });

  it('uses an upward swipe to discard a sleeve and a downward swipe to restore the previous sleeve', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);
    await swipeActive(0, -110);

    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toContain('Buhloone Mindstate');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
    expect(await page.locator('[data-dig-slide]:visible').count()).toBe(1);

    await swipeActive(0, 110);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toContain('3 Feet High and Rising');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
    expect(await page.locator('[data-dig-slide]:visible').count()).toBe(1);
  });

  it('keeps finger flipping and vertical record navigation working with reduced motion', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadPage(375, 812);

    const state = await page.evaluate(() => ({
      reducedMotionFlag: document.querySelector('[data-dig-experience]')?.getAttribute('data-reduced-motion'),
      visibleSlides: Array.from(document.querySelectorAll<HTMLElement>('[data-dig-slide]'))
        .filter((slide) => getComputedStyle(slide).visibility === 'visible').length,
      cardTransform: getComputedStyle(document.querySelector('[data-dig-slide].is-active [data-dig-sleeve-card]')!).transform,
    }));
    expect(state.reducedMotionFlag).toBe('true');
    expect(state.visibleSlides).toBe(1);
    expect(state.cardTransform).toBe('none');

    await swipeActive(-110, 0);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toContain('3 Feet High and Rising');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(true);

    await swipeActive(0, -110);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toContain('Buhloone Mindstate');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(false);
    expect(await page.locator('[data-dig-slide]:visible').count()).toBe(1);
  });

  it('keeps the conventional Dig heading and browse controls unchanged on desktop', async () => {
    await loadPage(1280, 900);
    expect(await page.locator('.mobile-context-header').isVisible()).toBe(false);
    expect(await page.locator('.browse-header h1').isVisible()).toBe(true);
    expect(await page.locator('.dig-page-header h1').isVisible()).toBe(false);
    expect(await page.locator('.dig-search-control-bar').isVisible()).toBe(true);
    expect(await page.locator('.dig-responsive-desktop').isVisible()).toBe(true);
    expect(await page.locator('.mobile-dig-back').isVisible()).toBe(false);
    const desktopWidths = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(desktopWidths.documentWidth).toBeLessThanOrEqual(1280);
    expect(desktopWidths.bodyWidth).toBeLessThanOrEqual(1280);
  });
});
