/// <reference lib="dom" />
import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Mobile Dig app-like viewport', () => {
  jest.setTimeout(30000);

  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const digPath = path.join(__dirname, '../views/browse/responsive-dig.ejs');
  const css = readFullStylesheetSource();
  const digState = fs.readFileSync(path.join(__dirname, '../public/js/dig-state.js'), 'utf8');
  const digMode = fs.readFileSync(path.join(__dirname, '../public/js/dig-mode.js'), 'utf8');
  const digCrateFilter = fs.readFileSync(path.join(__dirname, '../public/js/dig-crate-filter.js'), 'utf8');
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
  type TestDigItem = Omit<ReturnType<typeof makeItem>, 'backArtwork'> & {
    backArtwork: { src: string; altText: string } | null;
  };

  const items: TestDigItem[] = [
    makeItem('listing-1', '3 Feet High and Rising', 1989, '€20.00'),
    makeItem('listing-2', 'Buhloone Mindstate', 1993, '€18.00'),
  ];

  const svgDataUri = (svg: string) => 'data:image/svg+xml,' + encodeURIComponent(svg);
  const littleFishBase = makeItem('listing-little-fish', 'Little Fish', 1996, '€8.00');
  const littleFishItem: TestDigItem = {
    ...littleFishBase,
    frontArtwork: {
      ...littleFishBase.frontArtwork,
      src: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">' +
        '<rect width="300" height="300" fill="#273b42"/>' +
        '<rect x="18" y="18" width="264" height="264" fill="none" stroke="#c2b397" stroke-width="4"/>' +
        '<path d="M44 150 Q85 105 126 150 T208 150 L246 126 L246 174 L208 150 Q167 195 126 150 T44 150Z" fill="#d0c0a2"/>' +
        '<text x="150" y="54" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#f0e6d3">LITTLE FISH</text>' +
        '</svg>'
      ),
      altText: 'Test front artwork for Little Fish',
    },
    backArtwork: {
      src: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">' +
        '<rect width="300" height="180" fill="#2d343b"/>' +
        '<rect x="8" y="8" width="284" height="164" fill="none" stroke="#b8a17e" stroke-width="3"/>' +
        '<text x="150" y="55" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#d5c5a8">LITTLE FISH</text>' +
        '<path d="M50 95 Q85 65 120 95 T190 95 L230 75 L230 115 L190 95 Q155 125 120 95 T50 95Z" fill="#b8a17e"/>' +
        '<text x="150" y="150" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#d5c5a8">REVERSE COVER · TEST ARTWORK</text>' +
        '</svg>'
      ),
      altText: 'Landscape-format reverse cover test artwork for Little Fish',
    },
  };

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

  async function renderPage(pageItems: TestDigItem[] = items): Promise<string> {
    const locals = {
      getIconSvg,
      currentPath: '/dig',
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
      title: 'Dig — The Vinyl Drop',
      items: pageItems,
      totalCount: pageItems.length ? 28 : 0,
      hasMore: false,
      filters,
      listings: [],
      formatOptions: [
        { value: 'LP', label: 'LP', description: 'Long-play records' },
        { value: '12-inch', label: '12-inch', description: '12-inch records' },
        { value: '7-inch', label: '7-inch', description: '7-inch records' },
      ],
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
      '<body' + (pageItems.length > 0 ? ' class="mobile-dig-session"' : '') + '>' + headerHtml +
      '<main class="main-content container">' + bodyContent + '</main></body></html>';
  }

  async function loadPage(
    width: number,
    height: number,
    pageItems: TestDigItem[] = items,
    mockVisualViewport = false
  ): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.setContent(await renderPage(pageItems));
    if (mockVisualViewport) {
      await page.evaluate((initialHeight) => {
        const viewport = Object.assign(new EventTarget(), {
          height: initialHeight,
          offsetTop: 0,
        });
        Object.defineProperty(window, 'visualViewport', {
          configurable: true,
          value: viewport,
        });
        (window as Window & {
          __digTestVisualViewport?: EventTarget & { height: number; offsetTop: number };
        }).__digTestVisualViewport = viewport;
      }, height);
    }
    await page.addScriptTag({ content: digState });
    await page.addScriptTag({ content: digMode });
    await page.addScriptTag({ content: digCrateFilter });
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
      const expectedSleeveWidth = Math.min(viewport.width * 0.88, 480, viewport.width - 40, viewport.height - 330);
      expect(dimensions.stageWidth).toBeLessThanOrEqual(expectedSleeveWidth + 1);
      expect(dimensions.stageWidth).toBeGreaterThan(expectedSleeveWidth * 0.9);
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

  async function dispatchTouchPointer(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    pointerId: number,
    x: number,
    y: number,
    isPrimary: boolean
  ): Promise<void> {
    await page.locator('[data-dig-slide].is-active [data-dig-swipe-area]').evaluate((element, input) => {
      element.dispatchEvent(new PointerEvent(input.type, {
        bubbles: true,
        cancelable: true,
        pointerId: input.pointerId,
        pointerType: 'touch',
        isPrimary: input.isPrimary,
        clientX: input.x,
        clientY: input.y,
        button: input.type === 'pointerup' ? -1 : 0,
        buttons: input.type === 'pointerup' ? 0 : 1,
      }));
    }, { type, pointerId, x, y, isPrimary });
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
    const reverseFaceBackground = await page.locator('[data-dig-slide].is-active .dig-sleeve-face-back')
      .evaluate((face) => getComputedStyle(face).backgroundColor);
    expect(reverseFaceBackground).not.toBe('rgba(0, 0, 0, 0)');
    const deckUnderlayBackground = await page.locator('[data-dig-slide].is-active .dig-sleeve-stage')
      .evaluate((stage) => getComputedStyle(stage, '::before').backgroundColor);
    expect(deckUnderlayBackground).toBe('rgba(0, 0, 0, 0)');
    const frontFaceBackground = await page.locator('[data-dig-slide].is-active .dig-sleeve-face-front')
      .evaluate((face) => getComputedStyle(face).backgroundColor);
    expect(frontFaceBackground).not.toBe('rgba(0, 0, 0, 0)');

    await swipeActive(110, 0);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toBe(initialLabel);
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(false);
    expect(await page.locator('[data-dig-slide]:visible').count()).toBe(1);
  });

  it('pinches and pans the sleeve artwork without scaling the cardboard, keeps zoom on flip, and resets after inactivity', async () => {
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812, [littleFishItem]);

    const stage = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const box = await stage.boundingBox();
    if (!box) throw new Error('Little Fish sleeve has no bounding box');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const startMidpoint = { x: centerX + 20, y: centerY - 10 };
    const firstStart = { x: startMidpoint.x - 45, y: startMidpoint.y - 30 };
    const secondStart = { x: startMidpoint.x + 45, y: startMidpoint.y + 30 };
    // This separation would exceed the maximum without the 2.5× clamp.
    const firstZoom = { x: startMidpoint.x - 115, y: startMidpoint.y - 77 };
    const secondZoom = { x: startMidpoint.x + 115, y: startMidpoint.y + 77 };

    const edgeBefore = await page.locator('[data-dig-slide].is-active .dig-sleeve-edge-top')
      .evaluate((edge) => getComputedStyle(edge).transform);

    await dispatchTouchPointer('pointerdown', 11, firstStart.x, firstStart.y, true);
    await dispatchTouchPointer('pointerdown', 12, secondStart.x, secondStart.y, false);
    await dispatchTouchPointer('pointermove', 11, firstZoom.x, firstZoom.y, true);
    await dispatchTouchPointer('pointermove', 12, secondZoom.x, secondZoom.y, false);

    const zoomed = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const element = card as HTMLElement;
      const frontImage = card.querySelector<HTMLElement>('.dig-sleeve-face-front .dig-sleeve-image');
      const backImage = card.querySelector<HTMLElement>('.dig-sleeve-face-back .dig-sleeve-image');
      const edge = card.querySelector<HTMLElement>('.dig-sleeve-edge-top');
      if (!frontImage || !backImage || !edge) throw new Error('The physical sleeve is missing a face image or cardboard edge');
      return {
        scale: Number.parseFloat(element.style.getPropertyValue('--dig-zoom-scale')),
        panX: Number.parseFloat(element.style.getPropertyValue('--dig-zoom-pan-x')),
        panY: Number.parseFloat(element.style.getPropertyValue('--dig-zoom-pan-y')),
        frontTransform: getComputedStyle(frontImage).transform,
        backTransform: getComputedStyle(backImage).transform,
        edgeTransform: getComputedStyle(edge).transform,
        cardTransform: getComputedStyle(element).transform,
        zoomed: element.classList.contains('is-zoomed'),
        zooming: element.classList.contains('is-zooming'),
      };
    });

    expect(zoomed.zoomed).toBe(true);
    expect(zoomed.zooming).toBe(true);
    expect(zoomed.scale).toBeCloseTo(2.5, 2);
    expect(Math.abs(zoomed.panX)).toBeGreaterThan(0);
    expect(Math.abs(zoomed.panY)).toBeGreaterThan(0);
    expect(zoomed.frontTransform).not.toBe('none');
    expect(zoomed.backTransform).toBe(zoomed.frontTransform);
    expect(zoomed.cardTransform).toBe('none');
    expect(zoomed.edgeTransform).toBe(edgeBefore);

    // Two fingers moving together pan the same focal artwork point. The pan
    // remains bounded by the extra area created by the current zoom factor.
    await dispatchTouchPointer('pointermove', 11, firstZoom.x + 20, firstZoom.y + 14, true);
    await dispatchTouchPointer('pointermove', 12, secondZoom.x + 20, secondZoom.y + 14, false);
    const panned = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const element = card as HTMLElement;
      const scale = Number.parseFloat(element.style.getPropertyValue('--dig-zoom-scale'));
      return {
        scale,
        panX: Number.parseFloat(element.style.getPropertyValue('--dig-zoom-pan-x')),
        panY: Number.parseFloat(element.style.getPropertyValue('--dig-zoom-pan-y')),
        backTransform: getComputedStyle(
          card.querySelector<HTMLElement>('.dig-sleeve-face-back .dig-sleeve-image')!
        ).transform,
        width: card.closest('.dig-sleeve-stage')?.getBoundingClientRect().width ?? 0,
        height: card.closest('.dig-sleeve-stage')?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(panned.scale).toBeCloseTo(zoomed.scale, 1);
    expect(Math.abs(panned.panX)).toBeLessThanOrEqual((panned.scale - 1) * panned.width / 2 + 1);
    expect(Math.abs(panned.panY)).toBeLessThanOrEqual((panned.scale - 1) * panned.height / 2 + 1);

    // If one finger is lifted, pinch capture ends but the zoom is retained.
    await dispatchTouchPointer('pointerup', 11, firstZoom.x + 20, firstZoom.y + 14, true);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-zoomed') && !card.classList.contains('is-zooming')
    )).toBe(true);

    // Flipping the same record must reveal its reverse face at the same zoom.
    await page.locator('[data-dig-slide].is-active [data-dig-flip]').evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    const reverseZoom = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const backImage = card.querySelector<HTMLElement>('.dig-sleeve-face-back .dig-sleeve-image');
      if (!backImage) throw new Error('Back-face artwork is missing');
      return {
        flipped: card.classList.contains('is-flipped'),
        scale: Number.parseFloat((card as HTMLElement).style.getPropertyValue('--dig-zoom-scale')),
        backTransform: getComputedStyle(backImage).transform,
      };
    });
    expect(reverseZoom.flipped).toBe(true);
    expect(reverseZoom.scale).toBeCloseTo(panned.scale, 2);
    expect(reverseZoom.backTransform).toBe(panned.backTransform);

    // Pinching back to 1× immediately removes the temporary zoom state.
    const currentBox = await stage.boundingBox();
    if (!currentBox) throw new Error('Flipped sleeve has no bounding box');
    const currentX = currentBox.x + currentBox.width / 2;
    const currentY = currentBox.y + currentBox.height / 2;
    await dispatchTouchPointer('pointerdown', 21, currentX - 40, currentY, true);
    await dispatchTouchPointer('pointerdown', 22, currentX + 40, currentY, false);
    await dispatchTouchPointer('pointermove', 21, currentX - 5, currentY, true);
    await dispatchTouchPointer('pointermove', 22, currentX + 5, currentY, false);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => ({
      zoomed: card.classList.contains('is-zoomed'),
      scale: (card as HTMLElement).style.getPropertyValue('--dig-zoom-scale'),
    }))).toEqual({ zoomed: false, scale: '' });
    await dispatchTouchPointer('pointerup', 22, currentX + 5, currentY, false);

    // An idle timeout must never fire while both fingers are still touching
    // the sleeve. It starts only after the pinch interaction ends.
    await dispatchTouchPointer('pointerdown', 31, currentX - 40, currentY, true);
    await dispatchTouchPointer('pointerdown', 32, currentX + 40, currentY, false);
    await dispatchTouchPointer('pointermove', 31, currentX - 90, currentY, true);
    await dispatchTouchPointer('pointermove', 32, currentX + 90, currentY, false);
    await page.clock.fastForward(5100);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-zoomed')
    )).toBe(true);

    await dispatchTouchPointer('pointerup', 31, currentX - 90, currentY, true);
    await page.clock.fastForward(5001);
    const idleReset = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => ({
      zoomed: card.classList.contains('is-zoomed'),
      scale: (card as HTMLElement).style.getPropertyValue('--dig-zoom-scale'),
      panX: (card as HTMLElement).style.getPropertyValue('--dig-zoom-pan-x'),
      panY: (card as HTMLElement).style.getPropertyValue('--dig-zoom-pan-y'),
    }));
    expect(idleReset).toEqual({ zoomed: false, scale: '', panX: '', panY: '' });
  });

  it('resets temporary zoom and pan when Dig navigates to a different record', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812, [littleFishItem, items[1]]);

    const box = await page.locator('[data-dig-slide].is-active [data-dig-swipe-area]').boundingBox();
    if (!box) throw new Error('Active sleeve has no bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await dispatchTouchPointer('pointerdown', 41, x - 40, y, true);
    await dispatchTouchPointer('pointerdown', 42, x + 40, y, false);
    await dispatchTouchPointer('pointermove', 41, x - 80, y - 20, true);
    await dispatchTouchPointer('pointermove', 42, x + 80, y + 20, false);
    await dispatchTouchPointer('pointerup', 41, x - 80, y - 20, true);

    await swipeActive(0, -120);
    const state = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const element = card as HTMLElement;
      return {
        activeTitle: card.closest('[data-dig-slide]')?.getAttribute('aria-label'),
        zoomed: card.classList.contains('is-zoomed'),
        scale: element.style.getPropertyValue('--dig-zoom-scale'),
        panX: element.style.getPropertyValue('--dig-zoom-pan-x'),
        panY: element.style.getPropertyValue('--dig-zoom-pan-y'),
      };
    });
    expect(state.activeTitle).toContain('Buhloone Mindstate');
    expect(state.zoomed).toBe(false);
    expect(state.scale).toBe('');
    expect(state.panX).toBe('');
    expect(state.panY).toBe('');
  });

  it('uses matte cardboard around Little Fish and keeps the reverse-photo seam joined during flips', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812, [littleFishItem]);

    expect(await page.locator('.dig-listing-meta h2').textContent()).toBe('Little Fish');
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>(
        '[data-dig-slide].is-active .dig-sleeve-face-back img'
      );
      return Boolean(image && image.complete && image.naturalWidth === 300 && image.naturalHeight === 180);
    });

    const restingStyle = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const back = card.querySelector<HTMLElement>('.dig-sleeve-face-back');
      const front = card.querySelector<HTMLElement>('.dig-sleeve-face-front');
      const top = card.querySelector<HTMLElement>('.dig-sleeve-edge-top');
      const right = card.querySelector<HTMLElement>('.dig-sleeve-edge-right');
      if (!back || !front || !top || !right) throw new Error('Little Fish sleeve is missing a 3D face');
      return {
        cardboardColor: getComputedStyle(card).getPropertyValue('--dig-sleeve-cardboard-color').trim(),
        backFaceColor: getComputedStyle(back).backgroundColor,
        frontFaceColor: getComputedStyle(front).backgroundColor,
        topEdgeColor: getComputedStyle(top).backgroundImage,
        rightEdgeColor: getComputedStyle(right).backgroundImage,
        backImageFit: getComputedStyle(back.querySelector('img')!).objectFit,
      };
    });
    expect(restingStyle.cardboardColor).toBe('#c2b397');
    expect(restingStyle.backFaceColor).toBe('rgb(194, 179, 151)');
    expect(restingStyle.frontFaceColor).toBe('rgb(194, 179, 151)');
    expect(restingStyle.topEdgeColor).toContain('rgb(208, 192, 162)');
    expect(restingStyle.rightEdgeColor).not.toContain('rgb(241, 229, 207)');
    expect(restingStyle.backImageFit).toBe('contain');

    // Stop at a partial front-edge rotation and check that the face and side
    // walls remain in one transform stack rather than showing a white frame.
    const stage = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const box = await stage.boundingBox();
    if (!box) throw new Error('Little Fish sleeve has no bounding box');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 48, startY, { steps: 4 });
    const partialPose = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]')
      .evaluate((card) => ({
        transform: (card as HTMLElement).style.transform,
        edgeColor: getComputedStyle(card.querySelector('.dig-sleeve-edge-left')!).backgroundImage,
        faceDepth: new DOMMatrixReadOnly(
          getComputedStyle(card.querySelector('.dig-sleeve-face-front')!).transform
        ).m43,
      }));
    expect(partialPose.transform).toContain('rotateY(');
    expect(partialPose.edgeColor).toContain('rgb(110, 89, 62)');
    expect(partialPose.faceDepth).toBeCloseTo(1.8, 1);
    await page.mouse.up();
    await page.waitForTimeout(400);

    await swipeActive(-110, 0);
    const flippedStyle = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const back = card.querySelector<HTMLElement>('.dig-sleeve-face-back')!;
      const image = back.querySelector<HTMLImageElement>('img')!;
      return {
        flipped: card.classList.contains('is-flipped'),
        backFaceColor: getComputedStyle(back).backgroundColor,
        imageNaturalWidth: image.naturalWidth,
        imageNaturalHeight: image.naturalHeight,
        dragging: card.classList.contains('is-dragging'),
      };
    });
    expect(flippedStyle.flipped).toBe(true);
    expect(flippedStyle.backFaceColor).toBe('rgb(194, 179, 151)');
    expect(flippedStyle.imageNaturalWidth).toBe(300);
    expect(flippedStyle.imageNaturalHeight).toBe(180);
    expect(flippedStyle.dragging).toBe(false);

    await swipeActive(110, 0);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => ({
      flipped: card.classList.contains('is-flipped'),
      dragging: card.classList.contains('is-dragging'),
      transform: (card as HTMLElement).style.transform,
    }))).toEqual({ flipped: false, dragging: false, transform: '' });
  });

  it('settles repeated front/back flips without leaving stale transforms or timers', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);

    const stageSelector = '[data-dig-slide].is-active [data-dig-swipe-area]';
    for (let turn = 0; turn < 8; turn += 1) {
      const stage = page.locator(stageSelector);
      const box = await stage.boundingBox();
      if (!box) throw new Error('Active Dig sleeve has no bounding box');

      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      const deltaX = turn % 2 === 0 ? -110 : 110;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + deltaX, startY, { steps: 8 });
      await page.mouse.up();

      // Start the next gesture before the previous settle fallback fires. This
      // forces pending work to settle/cancel instead of racing the next flip.
      await page.waitForTimeout(45);
    }

    await page.waitForTimeout(430);
    const finalState = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const element = card as HTMLElement;
      return {
        flipped: element.classList.contains('is-flipped'),
        dragging: element.classList.contains('is-dragging'),
        inlineTransform: element.style.transform,
        inlineTransition: element.style.transition,
        computedTransform: getComputedStyle(element).transform,
      };
    });
    expect(finalState.flipped).toBe(false);
    expect(finalState.dragging).toBe(false);
    expect(finalState.inlineTransform).toBe('');
    expect(finalState.inlineTransition).toBe('');
    expect(finalState.computedTransform).toBe('none');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
  });

  it('renders the mobile sleeve frame, jacket, and front image as exact squares at every supported width', async () => {
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 360, height: 740 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 896 },
    ]) {
      await loadPage(viewport.width, viewport.height);
      const geometry = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('[data-dig-slide].is-active .dig-sleeve-stage');
        const card = document.querySelector<HTMLElement>('[data-dig-slide].is-active [data-dig-sleeve-card]');
        const front = card?.querySelector<HTMLElement>('.dig-sleeve-face-front');
        const image = front?.querySelector<HTMLImageElement>('.dig-sleeve-image');
        if (!stage || !card || !front || !image) return null;
        const stageRect = stage.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const frontRect = front.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        return {
          stageRatio: stageRect.width / stageRect.height,
          cardRatio: cardRect.width / cardRect.height,
          frontRatio: frontRect.width / frontRect.height,
          imageBoxRatio: imageRect.width / imageRect.height,
          cardInsetLeft: cardRect.left - stageRect.left,
          cardInsetRight: stageRect.right - cardRect.right,
          cardInsetTop: cardRect.top - stageRect.top,
          cardInsetBottom: stageRect.bottom - cardRect.bottom,
          cardWidth: cardRect.width,
          cardHeight: cardRect.height,
        };
      });

      expect(geometry).not.toBeNull();
      expect(geometry!.stageRatio).toBeCloseTo(1, 2);
      expect(geometry!.cardRatio).toBeCloseTo(1, 2);
      expect(geometry!.frontRatio).toBeCloseTo(1, 2);
      expect(geometry!.imageBoxRatio).toBeCloseTo(1, 2);
      expect(Math.abs(geometry!.cardInsetLeft - geometry!.cardInsetRight)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry!.cardInsetTop - geometry!.cardInsetBottom)).toBeLessThanOrEqual(1);
      expect(geometry!.cardWidth).toBeCloseTo(geometry!.cardHeight, 0);
    }
  });

  it('keeps all four cardboard walls attached through horizontal flips and vertical deck tilt', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);

    const readGeometry = async () => page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const sleeveCard = card as HTMLElement;
      const edge = (side: 'top' | 'right' | 'bottom' | 'left') => {
        const element = card.querySelector<HTMLElement>('.dig-sleeve-edge-' + side);
        if (!element) throw new Error('Missing sleeve edge: ' + side);
        const style = getComputedStyle(element);
        const origin = style.transformOrigin.split(/\s+/).map((value) => Number.parseFloat(value));
        const rect = element.getBoundingClientRect();
        return {
          left: Number.parseFloat(style.left),
          top: Number.parseFloat(style.top),
          width: Number.parseFloat(style.width),
          height: Number.parseFloat(style.height),
          originX: origin[0],
          originY: origin[1],
          transform: style.transform,
          shadow: style.boxShadow,
          projectedWidth: rect.width,
          projectedHeight: rect.height,
        };
      };
      const faceDepth = (selector: string) => {
        const face = card.querySelector<HTMLElement>(selector);
        if (!face) throw new Error('Missing sleeve face: ' + selector);
        return new DOMMatrixReadOnly(getComputedStyle(face).transform).m43;
      };
      const frontFace = card.querySelector<HTMLElement>('.dig-sleeve-face-front');
      const topEdge = card.querySelector<HTMLElement>('.dig-sleeve-edge-top');
      if (!frontFace || !topEdge) throw new Error('Sleeve is missing its front face or top wall');
      const stage = card.closest('.dig-sleeve-stage');
      const interaction = card.closest('.dig-sleeve-interaction');
      const slide = card.closest('[data-dig-slide]');
      if (!stage || !interaction || !slide) throw new Error('Sleeve is missing a 3D context ancestor');
      const stack = card.closest('.dig-crate-stack');
      if (!stack) throw new Error('Sleeve has no crate stack');
      const stackStyle = getComputedStyle(stack);
      const stageBefore = getComputedStyle(stage, '::before');
      const overflowSelectors = [
        '.main-content',
        '.dig-responsive-page',
        '.dig-responsive-mobile',
        '.dig-page',
        '.dig-explorer',
        '.dig-viewer',
        '.dig-sleeve-interaction',
        '.dig-sleeve-stage',
        '.dig-crate-stack',
      ];
      const overflowStates = overflowSelectors.map((selector) => {
        const element = card.closest(selector);
        if (!element) throw new Error('Missing clip ancestor: ' + selector);
        return { selector, overflow: getComputedStyle(element).overflow };
      });
      const meta = card.closest('[data-dig-slide]')?.querySelector<HTMLElement>('.dig-listing-meta');
      const actions = card.closest('[data-dig-slide]')?.querySelector<HTMLElement>('.dig-card-actions');
      const price = card.closest('[data-dig-slide]')?.querySelector<HTMLElement>('.dig-price');
      if (!meta || !actions || !price) throw new Error('Missing record metadata or price');
      return {
        width: Number.parseFloat(getComputedStyle(sleeveCard).width),
        height: Number.parseFloat(getComputedStyle(sleeveCard).height),
        cardLeft: sleeveCard.offsetLeft,
        cardTop: sleeveCard.offsetTop,
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight,
        transform: getComputedStyle(sleeveCard).transform,
        flipped: sleeveCard.classList.contains('is-flipped'),
        threeDContext: {
          slide: getComputedStyle(slide).transformStyle,
          interaction: getComputedStyle(interaction).transformStyle,
          stage: getComputedStyle(stage).transformStyle,
          card: getComputedStyle(sleeveCard).transformStyle,
        },
        faceDepths: {
          front: faceDepth('.dig-sleeve-face-front'),
          back: faceDepth('.dig-sleeve-face-back'),
        },
        layerOrder: {
          wall: getComputedStyle(topEdge).zIndex,
          frontFace: getComputedStyle(frontFace).zIndex,
        },
        stageBeforeContent: stageBefore.content,
        stageBeforeDisplay: stageBefore.display,
        stageBeforeShadow: stageBefore.boxShadow,
        stackOverflow: stackStyle.overflow,
        stackClipMargin: stackStyle.getPropertyValue('overflow-clip-margin'),
        overflowStates,
        metadata: {
          transform: getComputedStyle(meta).transform,
          transitionDuration: getComputedStyle(meta).transitionDuration,
        },
        actions: {
          transform: getComputedStyle(actions).transform,
          transitionDuration: getComputedStyle(actions).transitionDuration,
        },
        price: {
          transform: getComputedStyle(price).transform,
          transitionDuration: getComputedStyle(price).transitionDuration,
        },
        edges: {
          top: edge('top'),
          right: edge('right'),
          bottom: edge('bottom'),
          left: edge('left'),
        },
      };
    });

    const expectHinges = (geometry: Awaited<ReturnType<typeof readGeometry>>, rotating: boolean) => {
      const { width, height, edges } = geometry;

      // The parent stage and the physical jacket must both remain square.
      // Equal 5% insets keep equal dimensions on all four sides.
      expect(geometry.stageWidth).toBeCloseTo(geometry.stageHeight, 0);
      expect(Math.abs(geometry.cardLeft - geometry.stageWidth * 0.05)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.cardTop - geometry.stageHeight * 0.05)).toBeLessThanOrEqual(1);
      expect(width).toBeCloseTo(geometry.stageWidth * 0.90, 0);
      expect(height).toBeCloseTo(geometry.stageHeight * 0.90, 0);
      expect(width / height).toBeCloseTo(1, 2);

      // The four 3px walls are centered on the cover perimeter, following the
      // CodePen box geometry. They must meet the front/back faces at +/-1.5px.
      expect(edges.top.left).toBe(0);
      expect(edges.top.top).toBeCloseTo(-1.5, 1);
      expect(edges.top.width).toBe(width);
      expect(edges.top.height).toBe(3);
      expect(edges.top.originX).toBeCloseTo(width / 2, 0);
      expect(edges.top.originY).toBeCloseTo(1.5, 1);

      expect(edges.bottom.left).toBe(0);
      expect(edges.bottom.top).toBeCloseTo(height - 1.5, 1);
      expect(edges.bottom.width).toBe(width);
      expect(edges.bottom.height).toBe(3);
      expect(edges.bottom.originX).toBeCloseTo(width / 2, 0);
      expect(edges.bottom.originY).toBeCloseTo(1.5, 1);

      expect(edges.left.left).toBeCloseTo(-1.5, 1);
      expect(edges.left.top).toBe(0);
      expect(edges.left.width).toBe(3);
      expect(edges.left.height).toBe(height);
      expect(edges.left.originX).toBeCloseTo(1.5, 1);
      expect(edges.left.originY).toBeCloseTo(height / 2, 0);

      expect(edges.right.left).toBeCloseTo(width - 1.5, 1);
      expect(edges.right.top).toBe(0);
      expect(edges.right.width).toBe(3);
      expect(edges.right.height).toBe(height);
      expect(edges.right.originX).toBeCloseTo(1.5, 1);
      expect(edges.right.originY).toBeCloseTo(height / 2, 0);

      expect(geometry.threeDContext).toEqual({
        slide: 'preserve-3d',
        interaction: 'preserve-3d',
        stage: 'preserve-3d',
        card: 'preserve-3d',
      });

      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect(edges[side].transform).not.toBe('none');
        expect(edges[side].shadow).toBe('none');
      }
      // Artwork faces share the actual outside planes with the cardboard walls.
      // Let 3D depth determine visibility; do not force cover-over-wall z-index.
      expect(geometry.faceDepths.front).toBeCloseTo(1.8, 1);
      expect(geometry.faceDepths.back).toBeCloseTo(-1.8, 1);
      expect(geometry.layerOrder).toEqual({ wall: 'auto', frontFace: 'auto' });
      expect(geometry.stageBeforeContent).toBe('none');
      expect(geometry.stageBeforeDisplay).toBe('none');
      expect(geometry.stageBeforeShadow).toBe('none');
      expect(geometry.stackOverflow).toBe('clip');
      expect(geometry.stackClipMargin).toBe('12px');
      expect(geometry.overflowStates).toHaveLength(9);
      const expectedOverflow = new Map([
        ['.main-content', 'hidden'],
        ['.dig-responsive-page', 'hidden'],
        ['.dig-responsive-mobile', 'hidden'],
        ['.dig-page', 'hidden'],
        ['.dig-explorer', 'visible'],
        ['.dig-viewer', 'visible'],
        ['.dig-sleeve-interaction', 'visible'],
        ['.dig-sleeve-stage', 'visible'],
        ['.dig-crate-stack', 'clip'],
      ]);
      expect(geometry.overflowStates.every(({ selector, overflow }) => expectedOverflow.get(selector) === overflow)).toBe(true);
      expect(geometry.metadata.transform).toBe('none');
      expect(geometry.metadata.transitionDuration).toBe('0s');
      expect(geometry.actions.transform).toBe('none');
      expect(geometry.actions.transitionDuration).toBe('0s');
      expect(geometry.price.transform).toBe('none');
      expect(geometry.price.transitionDuration).toBe('0s');
      if (rotating) expect(geometry.transform).not.toBe('none');
    };

    const dragArea = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const startPartialDrag = async (deltaX: number) => {
      const box = await dragArea.boundingBox();
      if (!box) throw new Error('Active Dig sleeve has no bounding box');
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + deltaX, startY, { steps: 3 });
      await page.waitForTimeout(35);
    };

    await startPartialDrag(-42);
    let geometry = await readGeometry();
    expectHinges(geometry, true);
    expect(geometry.flipped).toBe(false);
    await page.mouse.up();
    await page.waitForTimeout(320);
    geometry = await readGeometry();
    expectHinges(geometry, false);
    expect(geometry.flipped).toBe(false);

    await swipeActive(-110, 0);
    geometry = await readGeometry();
    expectHinges(geometry, false);
    expect(geometry.flipped).toBe(true);

    await startPartialDrag(42);
    geometry = await readGeometry();
    expectHinges(geometry, true);
    expect(geometry.flipped).toBe(true);
    await page.mouse.up();
    await page.waitForTimeout(320);
    geometry = await readGeometry();
    expectHinges(geometry, false);
    expect(geometry.flipped).toBe(true);

    await swipeActive(110, 0);
    geometry = await readGeometry();
    expectHinges(geometry, false);
    expect(geometry.flipped).toBe(false);

    // A deterministic partial Y rotation must project visible width from the
    // left/right walls rather than leaving permanent white lines at rest.
    const sleeveCard = page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]');
    await sleeveCard.evaluate((element) => {
      const node = element as HTMLElement;
      node.style.transition = 'none';
      node.style.transform = 'rotateY(35deg)';
    });
    geometry = await readGeometry();
    expectHinges(geometry, false);
    expect(Math.max(geometry.edges.left.projectedWidth, geometry.edges.right.projectedWidth)).toBeGreaterThan(0.5);
    await sleeveCard.evaluate((element) => {
      const node = element as HTMLElement;
      node.style.transform = '';
      node.style.transition = '';
    });

    // The card also moves through the vertical deck arc as a 3D object. The
    // stage must not flatten the top/bottom walls before the ancestor rotates.
    const interaction = page.locator('[data-dig-slide].is-active .dig-sleeve-interaction');
    await interaction.evaluate((element) => {
      const node = element as HTMLElement;
      node.style.transition = 'none';
      node.style.transform = 'translate3d(0, 0, -60px) rotateX(38deg)';
    });
    geometry = await readGeometry();
    expectHinges(geometry, false);
    expect(geometry.threeDContext.stage).toBe('preserve-3d');
    expect(geometry.edges.top.projectedHeight).toBeGreaterThan(0.5);
    expect(geometry.edges.bottom.projectedHeight).toBeGreaterThan(0.5);
    expect(await interaction.evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
    await interaction.evaluate((element) => {
      const node = element as HTMLElement;
      node.style.transform = '';
      node.style.transition = '';
    });
  });

  it('cancels a pending flip-settle timer before a second horizontal drag', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);

    const dragArea = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const firstBox = await dragArea.boundingBox();
    if (!firstBox) throw new Error('Active Dig sleeve has no bounding box');
    const startX = firstBox.x + firstBox.width / 2;
    const startY = firstBox.y + firstBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 110, startY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(60);

    const secondBox = await page.locator('[data-dig-slide].is-active [data-dig-swipe-area]').boundingBox();
    if (!secondBox) throw new Error('Active Dig sleeve has no bounding box');
    const secondX = secondBox.x + secondBox.width / 2;
    const secondY = secondBox.y + secondBox.height / 2;
    await page.mouse.move(secondX, secondY);
    await page.mouse.down();
    await page.mouse.move(secondX + 100, secondY, { steps: 5 });

    // Keep the second drag active beyond the first gesture's former 280 ms timer.
    await page.waitForTimeout(320);
    const dragState = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => ({
      isDragging: card.classList.contains('is-dragging'),
      transform: getComputedStyle(card).transform,
    }));
    expect(dragState.isDragging).toBe(true);
    expect(dragState.transform).not.toBe('none');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('1 of 2');
    await page.mouse.up();
  });

  it('animates button navigation from the 3D depth pose before settling face-on', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // 700px keeps the responsive Dig viewer and its navigation controls rendered,
    // while staying above the breakpoint that hides those controls.
    await loadPage(700, 900);

    await page.locator('[data-dig-next]').evaluate((button) => {
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        throw new Error('Dig next-record control is missing or disabled');
      }
      button.click();
    });
    await page.waitForTimeout(90);
    const inTransition = await page.locator('[data-dig-slide].is-active .dig-sleeve-interaction').evaluate((sleeve) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(sleeve).transform);
      return {
        transform: getComputedStyle(sleeve).transform,
        z: matrix.m43,
        rotation: Math.atan2(matrix.m23, matrix.m22) * 180 / Math.PI,
      };
    });
    expect(inTransition.transform).not.toBe('none');
    expect(inTransition.z).toBeLessThan(-1);
    expect(Math.abs(inTransition.rotation)).toBeGreaterThan(1);

    await page.waitForTimeout(600);
    const restingRotation = await page.locator('[data-dig-slide].is-active .dig-sleeve-interaction').evaluate((sleeve) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(sleeve).transform);
      return Math.atan2(matrix.m23, matrix.m22) * 180 / Math.PI;
    });
    expect(Math.abs(restingRotation)).toBeLessThan(1);
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
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
    const reducedMotionBackFaceDepth = await page.locator(
      '[data-dig-slide].is-active .dig-sleeve-face-back'
    ).evaluate((face) => new DOMMatrixReadOnly(getComputedStyle(face).transform).m43);
    expect(reducedMotionBackFaceDepth).toBeGreaterThan(1.5);
    expect(reducedMotionBackFaceDepth).toBeCloseTo(1.8, 1);

    await swipeActive(0, -110);
    expect(await page.locator('[data-dig-slide].is-active').getAttribute('aria-label')).toContain('Buhloone Mindstate');
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(false);
    expect(await page.locator('[data-dig-slide]:visible').count()).toBe(1);
  });

  it('keeps the complete crate artwork visible across short and tall mobile viewports', async () => {
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 375, height: 640 },
      { width: 375, height: 812 },
      { width: 430, height: 896 },
    ]) {
      await loadPage(viewport.width, viewport.height);
      const geometry = await page.evaluate(() => {
        const stack = document.querySelector('[data-dig-stack]') as HTMLElement | null;
        const image = document.querySelector('[data-dig-crate-source] img') as HTMLImageElement | null;
        const explorer = document.querySelector('.dig-responsive-mobile .dig-explorer') as HTMLElement | null;
        const viewer = document.querySelector('.dig-responsive-mobile .dig-viewer') as HTMLElement | null;
        const interaction = document.querySelector('[data-dig-slide].is-active .dig-sleeve-interaction') as HTMLElement | null;
        if (!stack || !image || !explorer || !viewer || !interaction) return null;
        const stackRect = stack.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          stackLeft: stackRect.left,
          stackWidth: stackRect.width,
          imageTopOffset: imageRect.top - stackRect.top,
          imageBottomGap: stackRect.bottom - imageRect.bottom,
          imageLeftInset: imageRect.left - stackRect.left,
          imageRightInset: stackRect.right - imageRect.right,
          imageWidth: imageRect.width,
          imageHeight: imageRect.height,
          explorerOverflow: getComputedStyle(explorer).overflow,
          viewerOverflow: getComputedStyle(viewer).overflow,
          interactionOverflow: getComputedStyle(interaction).overflow,
          stackOverflow: getComputedStyle(stack).overflow,
        };
      });

      expect(geometry).not.toBeNull();
      expect(Math.abs(geometry!.stackLeft)).toBeLessThanOrEqual(1);
      expect(geometry!.stackWidth).toBeCloseTo(viewport.width, 0);
      expect(Math.abs(geometry!.imageTopOffset)).toBeLessThanOrEqual(1);
      expect(geometry!.imageBottomGap).toBeGreaterThanOrEqual(-1);
      expect(geometry!.imageLeftInset).toBeGreaterThan(0);
      expect(geometry!.imageRightInset).toBeGreaterThan(0);
      expect(geometry!.imageWidth).toBeGreaterThan(0);
      expect(geometry!.imageHeight).toBeGreaterThan(0);
      // Let the viewport-width crate bleed past padded wrappers and allow 3D sleeve corners to rotate freely.
      expect(geometry!.explorerOverflow).toBe('visible');
      expect(geometry!.viewerOverflow).toBe('visible');
      expect(geometry!.interactionOverflow).toBe('visible');
      // Keep clipping at the deck boundary, not around the sleeve itself.
      expect(geometry!.stackOverflow).toBe('clip');
    }
  });

  it('uses the supplied crate and preserves filter values when the mobile overlay is cancelled', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);

    const crateImage = page.locator('[data-dig-crate-source] img');
    expect(await crateImage.getAttribute('src')).toBe('/assets/UI/dig_crate.webp');
    expect(await crateImage.getAttribute('alt')).toBe('');

    const crateGeometry = await page.evaluate(() => {
      const source = document.querySelector('[data-dig-crate-source]') as HTMLElement | null;
      const image = source?.querySelector('img') as HTMLImageElement | null;
      const stack = document.querySelector('[data-dig-stack]') as HTMLElement | null;
      if (!source || !image || !stack) return null;
      const imageRect = image.getBoundingClientRect();
      const stackRect = stack.getBoundingClientRect();
      const stage = document.querySelector('[data-dig-slide].is-active .dig-sleeve-stage') as HTMLElement | null;
      if (!stage) return null;
      const stageRect = stage.getBoundingClientRect();
      return {
        sourceZIndex: getComputedStyle(source).zIndex,
        imagePosition: getComputedStyle(image).position,
        imageWidth: imageRect.width,
        imageLeftInset: imageRect.left - stackRect.left,
        imageRightInset: stackRect.right - imageRect.right,
        stackLeft: stackRect.left,
        stackWidth: stackRect.width,
        stageWidth: stageRect.width,
        stageLeftInset: stageRect.left - stackRect.left,
        stageRightInset: stackRect.right - stageRect.right,
        imageTopOffset: imageRect.top - stackRect.top,
        transformOrigin: getComputedStyle(image).transformOrigin,
      };
    });
    expect(crateGeometry).not.toBeNull();
    expect(crateGeometry!.sourceZIndex).toBe('-1');
    expect(crateGeometry!.imagePosition).toBe('absolute');
    expect(crateGeometry!.stackLeft).toBeCloseTo(0, 0);
    expect(crateGeometry!.stackWidth).toBeCloseTo(375, 0);
    expect(crateGeometry!.imageWidth).toBeCloseTo(Math.min(375 * 0.94, 510, 375 - 24, 812 - 320), 0);
    expect(crateGeometry!.imageLeftInset).toBeGreaterThanOrEqual(8);
    expect(crateGeometry!.imageRightInset).toBeGreaterThanOrEqual(8);
    expect(crateGeometry!.stageWidth).toBeCloseTo(Math.min(375 * 0.88, 480, 375 - 40, 812 - 330), 0);
    expect(crateGeometry!.stageWidth).toBeLessThan(crateGeometry!.imageWidth - 12);
    expect(crateGeometry!.stageLeftInset).toBeGreaterThanOrEqual(15);
    expect(crateGeometry!.stageRightInset).toBeGreaterThanOrEqual(15);
    expect(Math.abs(crateGeometry!.imageTopOffset)).toBeLessThanOrEqual(1);
    expect(crateGeometry!.transformOrigin.endsWith(' 0px')).toBe(true);

    const visualTreatment = await page.evaluate(() => {
      const stage = document.querySelector('[data-dig-slide].is-active .dig-sleeve-stage') as HTMLElement | null;
      const meta = document.querySelector('[data-dig-slide].is-active .dig-listing-meta') as HTMLElement | null;
      const price = document.querySelector('[data-dig-slide].is-active .dig-price') as HTMLElement | null;
      const listingLink = document.querySelector('[data-dig-slide].is-active .dig-listing-link') as HTMLAnchorElement | null;
      const filterIcon = document.querySelector('[data-dig-filter-open] img') as HTMLImageElement | null;
      const siteHeader = document.querySelector('.site-header') as HTMLElement | null;
      if (!stage || !meta || !price || !listingLink || !filterIcon || !siteHeader) return null;
      return {
        pseudoContent: getComputedStyle(stage, '::before').content,
        pseudoDisplay: getComputedStyle(stage, '::before').display,
        pseudoShadow: getComputedStyle(stage, '::before').boxShadow,
        explorerBackground: getComputedStyle(document.querySelector('.dig-explorer')!).backgroundColor,
        metaBackground: getComputedStyle(meta).backgroundColor,
        metaBackdropFilter: getComputedStyle(meta).getPropertyValue('backdrop-filter'),
        metaBorderTopWidth: getComputedStyle(meta).borderTopWidth,
        metaBorderTopColor: getComputedStyle(meta).borderTopColor,
        priceBackgroundImage: getComputedStyle(price).backgroundImage,
        listingLabel: listingLink.getAttribute('aria-label'),
        listingText: listingLink.textContent?.trim(),
        listingIcon: listingLink.querySelector('img')?.getAttribute('src'),
        filterIcon: filterIcon.getAttribute('src'),
        siteHeaderBackground: getComputedStyle(siteHeader).backgroundColor,
        siteHeaderBackdropFilter: getComputedStyle(siteHeader).getPropertyValue('backdrop-filter'),
        siteHeaderBorderBottomWidth: getComputedStyle(siteHeader).borderBottomWidth,
        siteHeaderBorderBottomColor: getComputedStyle(siteHeader).borderBottomColor,
      };
    });
    expect(visualTreatment).not.toBeNull();
    expect(visualTreatment!.pseudoContent).toBe('none');
    expect(visualTreatment!.pseudoDisplay).toBe('none');
    expect(visualTreatment!.pseudoShadow).toBe('none');
    expect(visualTreatment!.explorerBackground).toBe('rgb(232, 225, 213)');
    expect(visualTreatment!.metaBackground).toBe('rgba(243, 239, 231, 0.82)');
    expect(visualTreatment!.metaBackdropFilter).toContain('blur(12px)');
    expect(visualTreatment!.metaBorderTopWidth).toBe('2px');
    expect(visualTreatment!.metaBorderTopColor).toBe('rgba(246, 15, 75, 0.76)');
    expect(visualTreatment!.siteHeaderBackground).toBe('rgba(243, 239, 231, 0.92)');
    expect(visualTreatment!.siteHeaderBackdropFilter).toBe('none');
    expect(visualTreatment!.siteHeaderBorderBottomWidth).toBe('1px');
    expect(visualTreatment!.siteHeaderBorderBottomColor).toBe('rgba(21, 21, 21, 0.14)');
    expect(visualTreatment!.priceBackgroundImage).toContain('/assets/UI/price_tag.svg');
    expect(visualTreatment!.listingLabel).toContain('Open listing for');
    expect(visualTreatment!.listingText).toBe('');
    expect(visualTreatment!.listingIcon).toBe('/assets/svg/look-at.svg');
    expect(visualTreatment!.filterIcon).toBe('/assets/svg/funnel.svg');

    const lookAtSvg = fs.readFileSync(path.join(__dirname, '../public/assets/svg/look-at.svg'), 'utf8');
    expect(lookAtSvg).not.toContain('M0 0h512v512H0z');
    expect(lookAtSvg).toContain('fill="#1c1c1c"');

    const toolbar = page.locator('[data-dig-crate-toolbar]');
    const explorer = page.locator('.dig-explorer');
    expect(await toolbar.evaluate((element, explorerElement) => {
      return Boolean(explorerElement && explorerElement.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, await explorer.elementHandle())).toBe(true);
    const buttonWidths = await page.evaluate(() => {
      const toolbarElement = document.querySelector('[data-dig-crate-toolbar]') as HTMLElement | null;
      const buttonElement = document.querySelector('[data-dig-filter-open]') as HTMLElement | null;
      return {
        toolbarWidth: toolbarElement?.getBoundingClientRect().width ?? 0,
        buttonWidth: buttonElement?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(buttonWidths.toolbarWidth).toBeGreaterThan(0);
    expect(Math.abs(buttonWidths.toolbarWidth - buttonWidths.buttonWidth)).toBeLessThanOrEqual(1);

    const trigger = page.locator('[data-dig-filter-open]');
    const dialog = page.locator('[data-dig-filter-dialog]');
    expect(await trigger.isVisible()).toBe(true);
    expect(await dialog.isVisible()).toBe(false);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');

    await trigger.click();
    expect(await dialog.isVisible()).toBe(true);
    expect(await trigger.getAttribute('aria-expanded')).toBe('true');
    await page.waitForFunction(() =>
      document.querySelector('[data-dig-filter-dialog]')?.classList.contains('is-open')
    );
    const mobilePanelState = await dialog.evaluate((element) => ({
      isModal: element.matches(':modal'),
      transitionProperty: getComputedStyle(element).transitionProperty,
      transitionDuration: getComputedStyle(element).transitionDuration,
    }));
    expect(mobilePanelState.isModal).toBe(false);
    expect(await dialog.evaluate((element) => element.parentElement === document.body)).toBe(true);
    expect(mobilePanelState.transitionProperty).toContain('transform');
    expect(parseFloat(mobilePanelState.transitionDuration)).toBeGreaterThanOrEqual(0.3);
    await page.waitForFunction(() => {
      const dialogElement = document.querySelector('[data-dig-filter-dialog]');
      const navigation = document.querySelector('.mobile-bottom-nav');
      if (!(dialogElement instanceof HTMLElement) || !(navigation instanceof HTMLElement)) return false;
      return Math.abs(
        dialogElement.getBoundingClientRect().bottom - navigation.getBoundingClientRect().top
      ) <= 1;
    });
    const sheetGeometry = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const navigation = document.querySelector('.mobile-bottom-nav');
      if (!navigation) throw new Error('Mobile bottom navigation is missing from the test page');
      const navigationRect = navigation.getBoundingClientRect();
      return {
        position: style.position,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        height: rect.height,
        navigationTop: navigationRect.top,
      };
    });
    expect(sheetGeometry.position).toBe('fixed');
    expect(sheetGeometry.height).toBeGreaterThan(0);
    expect(sheetGeometry.top).toBeLessThan(85);
    expect(sheetGeometry.left).toBe(0);
    expect(sheetGeometry.right).toBe(375);
    expect(Math.abs(sheetGeometry.bottom - sheetGeometry.navigationTop)).toBeLessThanOrEqual(1);
    expect(await dialog.locator('form').getAttribute('action')).toBe('/dig');
    expect(await dialog.locator('input[name="q"]').inputValue()).toBe('De La Soul');
    expect(await dialog.locator('select[name="genre"]').inputValue()).toBe('Hip Hop');
    expect(await dialog.locator('select[name="condition"]').inputValue()).toBe('VG+');
    expect(await dialog.locator('input[name="minPrice"]').inputValue()).toBe('10.00');
    expect(await dialog.locator('input[name="maxPrice"]').inputValue()).toBe('50.00');
    expect(await dialog.locator('select[name="sort"]').inputValue()).toBe('price_asc');
    expect(await dialog.locator('input[name="whiteLabel"]').isChecked()).toBe(true);
    expect(await dialog.locator('input[name="format"]:checked').evaluateAll((elements) =>
      elements.map((element) => (element as HTMLInputElement).value)
    )).toEqual(['LP', '7-inch']);
    expect(await dialog.locator('label[data-format] img').evaluateAll((images) =>
      images.map((image) => ({
        format: image.closest('label')?.getAttribute('data-format'),
        source: (image as HTMLImageElement).getAttribute('src'),
        decorative: (image as HTMLImageElement).getAttribute('aria-hidden'),
      }))
    )).toEqual([
      { format: 'lp', source: '/assets/UI/LP.svg', decorative: 'true' },
      { format: '12-inch', source: '/assets/UI/12-ince.svg', decorative: 'true' },
      { format: '7-inch', source: '/assets/UI/7-ince.svg', decorative: 'true' },
    ]);
    const formatLayout = await dialog.locator('.dig-crate-format-options').evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.trim().split(' ').filter(Boolean).length,
      tileDisplays: Array.from(element.querySelectorAll('label[data-format]')).map((tile) =>
        getComputedStyle(tile).display
      ),
      tileDirections: Array.from(element.querySelectorAll('label[data-format]')).map((tile) =>
        getComputedStyle(tile).flexDirection
      ),
      iconWidths: Array.from(element.querySelectorAll('.dig-format-icon')).map((icon) =>
        Math.round(icon.getBoundingClientRect().width)
      ),
      labelsBelowIcons: Array.from(element.querySelectorAll('label[data-format]')).every((tile) => {
        const icon = tile.querySelector('.dig-format-icon');
        const label = tile.querySelector('span');
        if (!icon || !label) return false;
        return icon.getBoundingClientRect().bottom <= label.getBoundingClientRect().top;
      }),
    }));
    expect(formatLayout.columns).toBe(3);
    expect(formatLayout.tileDisplays).toEqual(['flex', 'flex', 'flex']);
    expect(formatLayout.tileDirections).toEqual(['column', 'column', 'column']);
    expect(formatLayout.iconWidths).toEqual([52, 52, 52]);
    expect(formatLayout.labelsBelowIcons).toBe(true);
    expect(await dialog.locator('.dig-crate-white-label-option').count()).toBe(1);
    expect(await dialog.locator('.dig-crate-white-label-option img').count()).toBe(0);

    const fieldOrder = await dialog.evaluate((element) => {
      const format = element.querySelector('legend');
      const genre = element.querySelector('label[for="dig-filter-genre"]');
      return Boolean(format && genre &&
        (format.compareDocumentPosition(genre) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(fieldOrder).toBe(true);

    // Mobile uses dialog.show(), not showModal(), so the browser creates no
    // modal backdrop and leaves the Dig screen itself undimmed.
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(false);
    const backdropColor = await dialog.evaluate((element) =>
      getComputedStyle(element, '::backdrop').backgroundColor
    );
    expect(backdropColor).toBe('rgba(0, 0, 0, 0)');

    await dialog.locator('input[name="q"]').fill('cancelled query');
    await dialog.locator('[data-dig-filter-cancel]').click();
    expect(await dialog.evaluate((element) => element.classList.contains('is-closing'))).toBe(true);
    await page.waitForFunction(() => {
      const currentDialog = document.querySelector('[data-dig-filter-dialog]');
      return !(currentDialog instanceof HTMLDialogElement) || !currentDialog.open;
    });
    expect(await dialog.isVisible()).toBe(false);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');

    await trigger.click();
    expect(await dialog.locator('input[name="q"]').inputValue()).toBe('De La Soul');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const currentDialog = document.querySelector('[data-dig-filter-dialog]');
      return !(currentDialog instanceof HTMLDialogElement) || !currentDialog.open;
    });
    expect(await dialog.isVisible()).toBe(false);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the mobile filter sheet and actions above fixed navigation on short and standard phones', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    for (const viewport of [
      { width: 320, height: 640 },
      { width: 375, height: 812 },
    ]) {
      await loadPage(viewport.width, viewport.height);
      const trigger = page.locator('[data-dig-filter-open]');
      const dialog = page.locator('[data-dig-filter-dialog]');
      await trigger.click();
      await page.waitForFunction(() => {
        const dialogElement = document.querySelector('[data-dig-filter-dialog]');
        const navigation = document.querySelector('.mobile-bottom-nav');
        if (!(dialogElement instanceof HTMLElement) || !(navigation instanceof HTMLElement)) return false;
        return Math.abs(
          dialogElement.getBoundingClientRect().bottom - navigation.getBoundingClientRect().top
        ) <= 1;
      });
      await dialog.locator('.dig-crate-filter-actions').scrollIntoViewIfNeeded();

      const geometry = await page.evaluate(() => {
        const dialogElement = document.querySelector('[data-dig-filter-dialog]') as HTMLDialogElement | null;
        const navigation = document.querySelector('.mobile-bottom-nav') as HTMLElement | null;
        const actions = document.querySelector('.dig-crate-filter-actions') as HTMLElement | null;
        if (!dialogElement || !navigation || !actions) throw new Error('Filter dialog, actions or navigation missing');
        const dialogRect = dialogElement.getBoundingClientRect();
        const navigationRect = navigation.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        return {
          viewportHeight: window.innerHeight,
          dialogTop: dialogRect.top,
          dialogBottom: dialogRect.bottom,
          navigationTop: navigationRect.top,
          navigationHeight: navigationRect.height,
          actionsBottom: actionsRect.bottom,
          navigationZIndex: getComputedStyle(navigation).zIndex,
        };
      });

      expect(geometry.dialogTop).toBeGreaterThanOrEqual(0);
      expect(Math.abs(geometry.dialogBottom - geometry.navigationTop)).toBeLessThanOrEqual(1);
      expect(geometry.actionsBottom).toBeLessThanOrEqual(geometry.navigationTop + 1);
      expect(geometry.dialogBottom).toBeLessThan(geometry.viewportHeight);
      expect(geometry.navigationHeight).toBeGreaterThanOrEqual(60);
      expect(geometry.navigationZIndex).toBe('200');
      expect(await page.locator('.mobile-bottom-nav').isVisible()).toBe(true);

      await dialog.locator('[data-dig-filter-cancel]').click();
      await page.waitForFunction(() => {
        const currentDialog = document.querySelector('[data-dig-filter-dialog]');
        return !(currentDialog instanceof HTMLDialogElement) || !currentDialog.open;
      });
    }
  });

  it('fits the mobile filter sheet into the visible viewport while the software keyboard is open', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const viewport of [
      { width: 320, height: 640 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await loadPage(viewport.width, viewport.height, items, true);
      const trigger = page.locator('[data-dig-filter-open]');
      const dialog = page.locator('[data-dig-filter-dialog]');
      await trigger.click();
      await page.waitForFunction(() => {
        const dialogElement = document.querySelector('[data-dig-filter-dialog]');
        const navigation = document.querySelector('.mobile-bottom-nav');
        if (!(dialogElement instanceof HTMLElement) || !(navigation instanceof HTMLElement)) return false;
        return Math.abs(
          dialogElement.getBoundingClientRect().bottom - navigation.getBoundingClientRect().top
        ) <= 1;
      });

      const keyboardHeight = Math.round(viewport.height * 0.48);
      const keyboardOffsetTop = viewport.width === 390 ? 18 : 0;
      await page.evaluate(({ visibleHeight, offsetTop }) => {
        const visualViewport = (window as Window & {
          __digTestVisualViewport?: EventTarget & { height: number; offsetTop: number };
        }).__digTestVisualViewport;
        if (!visualViewport) throw new Error('Test visual viewport was not installed');
        visualViewport.height = visibleHeight;
        visualViewport.offsetTop = offsetTop;
        visualViewport.dispatchEvent(new Event('resize'));
      }, { visibleHeight: keyboardHeight, offsetTop: keyboardOffsetTop });

      await page.waitForFunction(() =>
        document.querySelector('[data-dig-filter-dialog]')?.classList.contains('is-keyboard-open')
      );

      const keyboardGeometry = await page.evaluate(() => {
        const dialogElement = document.querySelector('[data-dig-filter-dialog]') as HTMLElement | null;
        const search = dialogElement?.querySelector('input[name="q"]') as HTMLElement | null;
        if (!dialogElement || !search) throw new Error('Filter dialog or search input missing');
        const dialogRect = dialogElement.getBoundingClientRect();
        const searchRect = search.getBoundingClientRect();
        return {
          dialogTop: dialogRect.top,
          dialogBottom: dialogRect.bottom,
          searchTop: searchRect.top,
          searchBottom: searchRect.bottom,
          maxHeight: getComputedStyle(dialogElement).maxHeight,
        };
      });
      expect(keyboardGeometry.dialogTop).toBeGreaterThanOrEqual(keyboardOffsetTop + 7);
      expect(keyboardGeometry.dialogBottom).toBeLessThanOrEqual(keyboardOffsetTop + keyboardHeight - 7);
      expect(keyboardGeometry.searchTop).toBeGreaterThanOrEqual(keyboardGeometry.dialogTop);
      expect(keyboardGeometry.searchBottom).toBeLessThanOrEqual(keyboardGeometry.dialogBottom);
      expect(keyboardGeometry.maxHeight).not.toBe(String(viewport.height) + 'px');

      await page.evaluate(() => {
        const dialogElement = document.querySelector('[data-dig-filter-dialog]');
        const lowerControl = dialogElement?.querySelector('input[name="maxPrice"]');
        if (!(lowerControl instanceof HTMLInputElement)) throw new Error('Lower price filter is missing');
        lowerControl.focus({ preventScroll: true });
      });
      await page.waitForFunction(() => {
        const dialogElement = document.querySelector('[data-dig-filter-dialog]');
        const lowerControl = dialogElement?.querySelector('input[name="maxPrice"]');
        if (!(dialogElement instanceof HTMLElement) || !(lowerControl instanceof HTMLElement)) return false;
        const dialogRect = dialogElement.getBoundingClientRect();
        const controlRect = lowerControl.getBoundingClientRect();
        return controlRect.top >= dialogRect.top + 8 && controlRect.bottom <= dialogRect.bottom - 8;
      });

      await dialog.locator('.dig-crate-filter-actions').scrollIntoViewIfNeeded();
      const actionBottom = await dialog.locator('.dig-crate-filter-actions').evaluate((element) =>
        element.getBoundingClientRect().bottom
      );
      const dialogBottom = await dialog.evaluate((element) => element.getBoundingClientRect().bottom);
      expect(actionBottom).toBeLessThanOrEqual(dialogBottom + 1);

      await page.evaluate((layoutHeight) => {
        const visualViewport = (window as Window & {
          __digTestVisualViewport?: EventTarget & { height: number; offsetTop: number };
        }).__digTestVisualViewport;
        if (!visualViewport) throw new Error('Test visual viewport was not installed');
        visualViewport.height = layoutHeight;
        visualViewport.offsetTop = 0;
        visualViewport.dispatchEvent(new Event('resize'));
      }, viewport.height);

      await page.waitForFunction(() => {
        const dialogElement = document.querySelector('[data-dig-filter-dialog]');
        const navigation = document.querySelector('.mobile-bottom-nav');
        if (!(dialogElement instanceof HTMLElement) || !(navigation instanceof HTMLElement)) return false;
        return !dialogElement.classList.contains('is-keyboard-open') &&
          Math.abs(
            dialogElement.getBoundingClientRect().bottom - navigation.getBoundingClientRect().top
          ) <= 1;
      });
      const restored = await dialog.evaluate((element) => {
        const navigation = document.querySelector('.mobile-bottom-nav');
        if (!navigation) throw new Error('Mobile bottom navigation missing');
        return {
          bottom: element.getBoundingClientRect().bottom,
          navigationTop: navigation.getBoundingClientRect().top,
        };
      });
      expect(Math.abs(restored.bottom - restored.navigationTop)).toBeLessThanOrEqual(1);

      await dialog.locator('[data-dig-filter-cancel]').click();
      expect(await dialog.isVisible()).toBe(false);
    }
  });

  it('closes the mobile filter sheet immediately when reduced motion is requested', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadPage(375, 812);

    const trigger = page.locator('[data-dig-filter-open]');
    const dialog = page.locator('[data-dig-filter-dialog]');
    await trigger.click();
    expect(await dialog.isVisible()).toBe(true);

    await dialog.locator('[data-dig-filter-cancel]').click();
    expect(await dialog.isVisible()).toBe(false);
    expect(await dialog.evaluate((element) => element.classList.contains('is-closing'))).toBe(false);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves the existing filters available when no mobile Dig records match', async () => {
    await loadPage(375, 812, []);

    expect(await page.locator('[data-dig-crate-toolbar]').count()).toBe(0);
    expect(await page.locator('[data-dig-crate-source]').count()).toBe(0);
    expect(await page.locator('[data-dig-filter-dialog]').count()).toBe(0);
    expect(await page.locator('.browse-filter-form').isVisible()).toBe(true);
  });

  it('keeps the conventional Dig heading and browse controls unchanged at desktop breakpoints', async () => {
    await loadPage(768, 900);

    for (const width of [768, 1024, 1280]) {
      if (width !== 768) await page.setViewportSize({ width, height: 900 });
      expect(await page.locator('.mobile-context-header').isVisible()).toBe(false);
      expect(await page.locator('.browse-header h1').isVisible()).toBe(true);
      expect(await page.locator('.dig-page-header h1').isVisible()).toBe(false);
      expect(await page.locator('.dig-search-control-bar').isVisible()).toBe(true);
      expect(await page.locator('.dig-responsive-desktop').isVisible()).toBe(true);
      expect(await page.locator('.mobile-dig-back').isVisible()).toBe(false);
      expect(await page.locator('[data-dig-crate-toolbar]').isVisible()).toBe(false);
      expect(await page.locator('[data-dig-crate-source]').isVisible()).toBe(false);
      expect(await page.locator('[data-dig-filter-dialog]').isVisible()).toBe(false);
      const desktopBackFaceBackgrounds = await page.locator('.dig-responsive-mobile .dig-sleeve-face-back')
        .evaluateAll((faces) => faces.map((face) => getComputedStyle(face).backgroundColor));
      expect(desktopBackFaceBackgrounds.length).toBeGreaterThan(0);
      expect(desktopBackFaceBackgrounds.every((color) => color !== 'rgba(0, 0, 0, 0)')).toBe(true);
      const desktopUnderlayBackgrounds = await page.locator('.dig-responsive-mobile .dig-sleeve-stage')
        .evaluateAll((stages) => stages.map((stage) => getComputedStyle(stage, '::before').backgroundColor));
      expect(desktopUnderlayBackgrounds.length).toBeGreaterThan(0);
      expect(desktopUnderlayBackgrounds.every((color) => color !== 'rgba(0, 0, 0, 0)')).toBe(true);
    }

    const desktopWidths = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(desktopWidths.documentWidth).toBeLessThanOrEqual(1280);
    expect(desktopWidths.bodyWidth).toBeLessThanOrEqual(1280);
  });
});
