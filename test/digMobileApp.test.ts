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
  const digPreferences = fs.readFileSync(path.join(__dirname, '../public/js/user-preferences.js'), 'utf8');
  const digSounds = fs.readFileSync(path.join(__dirname, '../public/js/dig-sounds.js'), 'utf8');
  const digState = fs.readFileSync(path.join(__dirname, '../public/js/dig-state.js'), 'utf8');
  const digMode = fs.readFileSync(path.join(__dirname, '../public/js/dig-mode.js'), 'utf8');
  const digSidebar = fs.readFileSync(path.join(__dirname, '../public/js/dig-sidebar.js'), 'utf8');
  let browser: Browser;
  let page: Page;

  const filters = {
    q: 'De La Soul',
    genre: 'Hip Hop',
    style: 'House',
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
      genreOptions: ['Hip Hop', 'Jazz'],
      styleOptions: ['House', 'Techno'],
      styleParentGenres: { House: ['Hip Hop'], Techno: ['Electronic'] },
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
      .replace('<script src="/js/user-preferences.js" defer></script>', '')
      .replace('<script src="/js/dig-sounds.js" defer></script>', '')
      .replace('<script src="/js/dig-state.js" defer></script>', '')
      .replace('<script src="/js/dig-mode.js" defer></script>', '')
      .replace('<script src="/js/dig-crate-filter.js" defer></script>', '');
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
    await page.evaluate(() => {
      const playedSounds: string[] = [];
      Object.defineProperty(window, '__digPlayedSounds', {
        configurable: true,
        value: playedSounds,
      });
      Object.defineProperty(window, 'Audio', {
        configurable: true,
        value: class TestAudio {
          src: string;
          currentTime = 0;
          volume = 1;
          preload = 'auto';

          constructor(src: string) {
            this.src = src;
          }

          play() {
            playedSounds.push(this.src);
            return Promise.resolve();
          }
        },
      });
    });
    await page.addScriptTag({ content: digPreferences });
    await page.addScriptTag({ content: digSounds });
    await page.addScriptTag({ content: digState });
    await page.addScriptTag({ content: digMode });
    await page.addScriptTag({ content: digSidebar });
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

  it('supports keyboard zoom and pan for sleeve inspection', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812, [littleFishItem]);
    const viewer = page.locator('[data-dig-viewer]');
    expect(await viewer.getAttribute('aria-label')).toContain('Press plus or equals to zoom in');
    await viewer.focus();

    await page.keyboard.press('=');
    const zoomed = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => {
      const element = card as HTMLElement;
      return {
        scale: Number.parseFloat(element.style.getPropertyValue('--dig-zoom-scale')),
        zoomed: card.classList.contains('is-zoomed'),
      };
    });
    expect(zoomed.zoomed).toBe(true);
    expect(zoomed.scale).toBeCloseTo(1.25, 2);

    await page.keyboard.press('ArrowRight');
    const panned = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      Number.parseFloat((card as HTMLElement).style.getPropertyValue('--dig-zoom-pan-x'))
    );
    expect(panned).toBeGreaterThan(0);

    await page.keyboard.press('-');
    const reset = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => ({
      zoomed: card.classList.contains('is-zoomed'),
      scale: (card as HTMLElement).style.getPropertyValue('--dig-zoom-scale'),
      panX: (card as HTMLElement).style.getPropertyValue('--dig-zoom-pan-x'),
      panY: (card as HTMLElement).style.getPropertyValue('--dig-zoom-pan-y'),
    }));
    expect(reset).toEqual({ zoomed: false, scale: '', panX: '', panY: '' });
  });

  it('keeps zoom transitions disabled when reduced motion is requested', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadPage(375, 812, [littleFishItem]);
    const duration = await page.locator('[data-dig-slide].is-active .dig-sleeve-face-front .dig-sleeve-image')
      .evaluate((image) => getComputedStyle(image).transitionDuration);
    expect(duration).toBe('0s');
  });

  it('continues from the visible zoom level when a pinch starts during the idle reset animation', async () => {
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812, [littleFishItem]);
    const stage = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const box = await stage.boundingBox();
    if (!box) throw new Error('Active sleeve has no bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await dispatchTouchPointer('pointerdown', 61, x - 40, y, true);
    await dispatchTouchPointer('pointerdown', 62, x + 40, y, false);
    await dispatchTouchPointer('pointermove', 61, x - 60, y, true);
    await dispatchTouchPointer('pointermove', 62, x + 60, y, false);
    await dispatchTouchPointer('pointerup', 61, x - 60, y, true);
    await dispatchTouchPointer('pointerup', 62, x + 60, y, false);

    await page.clock.fastForward(5000);
    await page.clock.fastForward(120);
    const visibleScale = await page.locator('[data-dig-slide].is-active .dig-sleeve-face-front .dig-sleeve-image')
      .evaluate((image) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
        return Math.sqrt(matrix.m11 * matrix.m11 + matrix.m12 * matrix.m12);
      });
    expect(visibleScale).toBeGreaterThan(1);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]')
      .evaluate((card) => card.classList.contains('is-zoom-resetting'))).toBe(true);

    // Read the in-flight transition and start the two-pointer gesture in one
    // browser task. Separate Playwright round trips let the CSS transition
    // advance between the expected-value sample and the second pointer-down.
    const resumed = await stage.evaluate((element, coordinates) => {
      const slide = element.closest('[data-dig-slide]');
      const image = slide?.querySelector<HTMLElement>('.dig-sleeve-face-front .dig-sleeve-image');
      const card = slide?.querySelector<HTMLElement>('[data-dig-sleeve-card]');
      if (!slide || !image || !card) throw new Error('Active sleeve artwork is missing');

      const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
      const expectedScale = Math.sqrt(matrix.m11 * matrix.m11 + matrix.m12 * matrix.m12);
      const pointerDown = (pointerId: number, clientX: number, isPrimary: boolean) => {
        element.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'touch',
          isPrimary,
          clientX,
          clientY: coordinates.y,
          button: 0,
          buttons: 1,
        }));
      };

      pointerDown(63, coordinates.x - 45, true);
      pointerDown(64, coordinates.x + 45, false);

      return {
        expectedScale,
        resumedScale: Number.parseFloat(card.style.getPropertyValue('--dig-zoom-scale')),
        zooming: card.classList.contains('is-zooming'),
      };
    }, { x, y });
    expect(resumed.expectedScale).toBeGreaterThan(1);
    expect(resumed.resumedScale).toBeCloseTo(resumed.expectedScale, 1);
    expect(resumed.zooming).toBe(true);

    await dispatchTouchPointer('pointerup', 63, x - 45, y, true);
    await dispatchTouchPointer('pointerup', 64, x + 45, y, false);
  });

  it('supports two non-primary touch contacts starting a pinch without a one-finger gesture', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812, [littleFishItem]);
    const box = await page.locator('[data-dig-slide].is-active [data-dig-swipe-area]').boundingBox();
    if (!box) throw new Error('Active sleeve has no bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await dispatchTouchPointer('pointerdown', 51, x - 40, y, false);
    await dispatchTouchPointer('pointerdown', 52, x + 40, y, false);
    await dispatchTouchPointer('pointermove', 51, x - 70, y, false);
    await dispatchTouchPointer('pointermove', 52, x + 70, y, false);

    const zoomed = await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) => ({
      zoomed: card.classList.contains('is-zoomed'),
      scale: Number.parseFloat((card as HTMLElement).style.getPropertyValue('--dig-zoom-scale')),
    }));
    expect(zoomed.zoomed).toBe(true);
    expect(zoomed.scale).toBeGreaterThan(1);

    await dispatchTouchPointer('pointerup', 51, x - 70, y, false);
    await dispatchTouchPointer('pointerup', 52, x + 70, y, false);
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
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    pointerId: number,
    x: number,
    y: number,
    isPrimary: boolean
  ): Promise<void> {
    await page.locator('[data-dig-slide].is-active [data-dig-swipe-area]').evaluate((element, input) => {
      const isEnd = input.type === 'pointerup' || input.type === 'pointercancel';
      element.dispatchEvent(new PointerEvent(input.type, {
        bubbles: true,
        cancelable: true,
        pointerId: input.pointerId,
        pointerType: 'touch',
        isPrimary: input.isPrimary,
        clientX: input.x,
        clientY: input.y,
        button: isEnd ? -1 : 0,
        buttons: isEnd ? 0 : 1,
      }));
    }, { type, pointerId, x, y, isPrimary });
  }

  async function mockDigVibration(mode: 'success' | 'blocked' | 'throw' | 'missing' = 'success'): Promise<void> {
    await page.evaluate((configuredMode) => {
      const calls: Array<number | number[]> = [];
      Object.defineProperty(window, '__digHapticCalls', {
        configurable: true,
        value: calls,
      });
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: configuredMode === 'missing'
          ? undefined
          : (pattern: number | number[]) => {
            calls.push(pattern);
            if (configuredMode === 'throw') throw new Error('Vibration is unavailable');
            return configuredMode !== 'blocked';
          },
      });
    }, mode);
  }

  async function readDigVibrationCalls(): Promise<Array<number | number[]>> {
    return page.evaluate(() => (
      (window as Window & { __digHapticCalls?: Array<number | number[]> }).__digHapticCalls || []
    ));
  }

  async function swipeActiveByTouch(deltaX: number, deltaY: number, pointerId = 100): Promise<void> {
    const stage = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const box = await stage.boundingBox();
    if (!box) throw new Error('Active Dig sleeve has no bounding box');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await dispatchTouchPointer('pointerdown', pointerId, startX, startY, true);
    await dispatchTouchPointer('pointermove', pointerId, startX + deltaX, startY + deltaY, true);
    await dispatchTouchPointer('pointerup', pointerId, startX + deltaX, startY + deltaY, true);
  }

  it('honors the independent haptic feedback preference without blocking Dig gestures', async () => {
    await loadPage(375, 812);
    await page.evaluate(() => (
      window as Window & {
        VinylDropPreferences?: { set(key: string, value: boolean): boolean };
      }
    ).VinylDropPreferences?.set('hapticFeedbackEnabled', false));
    await mockDigVibration();

    await swipeActiveByTouch(-110, 0, 1001);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(true);
    expect(await readDigVibrationCalls()).toEqual([]);

    await page.evaluate(() => (
      window as Window & {
        VinylDropPreferences?: { set(key: string, value: boolean): boolean };
      }
    ).VinylDropPreferences?.set('hapticFeedbackEnabled', true));
    await swipeActiveByTouch(110, 0, 1002);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(false);
    expect(await readDigVibrationCalls()).toEqual([10]);
  });

  it('requests one subtle haptic pulse for a committed touch flip and record change', async () => {
    await loadPage(375, 812);
    await mockDigVibration();

    await swipeActiveByTouch(-110, 0, 101);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(true);
    expect(await readDigVibrationCalls()).toEqual([10]);

    await swipeActiveByTouch(0, -110, 102);
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
    expect(await readDigVibrationCalls()).toEqual([10, 10]);

    // A record-boundary attempt does not commit a navigation or emit feedback.
    await swipeActiveByTouch(0, -110, 103);
    expect(await page.locator('[data-dig-header-position]').textContent()).toBe('2 of 2');
    expect(await readDigVibrationCalls()).toEqual([10, 10]);
  });

  it('does not request haptics for cancelled, short, pinch, mouse or button interactions', async () => {
    await loadPage(375, 812);
    await mockDigVibration();

    const stage = page.locator('[data-dig-slide].is-active [data-dig-swipe-area]');
    const box = await stage.boundingBox();
    if (!box) throw new Error('Active Dig sleeve has no bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // A short touch is not a committed flip.
    await dispatchTouchPointer('pointerdown', 111, x, y, true);
    await dispatchTouchPointer('pointerup', 111, x + 20, y, true);

    // A cancelled gesture must never produce feedback.
    await dispatchTouchPointer('pointerdown', 112, x, y, true);
    await dispatchTouchPointer('pointermove', 112, x - 110, y, true);
    await dispatchTouchPointer('pointercancel', 112, x - 110, y, true);

    // Pinch completion is a separate gesture path, not a sleeve flip.
    await dispatchTouchPointer('pointerdown', 113, x - 35, y, true);
    await dispatchTouchPointer('pointerdown', 114, x + 35, y, false);
    await dispatchTouchPointer('pointermove', 113, x - 70, y, true);
    await dispatchTouchPointer('pointermove', 114, x + 70, y, false);
    await dispatchTouchPointer('pointerup', 113, x - 70, y, true);
    await dispatchTouchPointer('pointerup', 114, x + 70, y, false);

    // Mouse and button-driven flips remain silent.
    await swipeActive(-110, 0);
    await page.locator('[data-dig-slide].is-active [data-dig-flip]').evaluate((button) => {
      (button as HTMLButtonElement).click();
    });

    expect(await readDigVibrationCalls()).toEqual([]);
  });

  it('fails silently when vibration is unavailable, blocked or throws', async () => {
    await loadPage(375, 812);

    await mockDigVibration('missing');
    await swipeActiveByTouch(-110, 0, 121);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(true);
    expect(await readDigVibrationCalls()).toEqual([]);

    await mockDigVibration('throw');
    await swipeActiveByTouch(110, 0, 122);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(false);
    expect(await readDigVibrationCalls()).toEqual([10]);

    await mockDigVibration('blocked');
    await swipeActiveByTouch(-110, 0, 123);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-flipped')
    )).toBe(true);
    expect(await readDigVibrationCalls()).toEqual([10]);
  });

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
        width: element.clientWidth,
        height: element.clientHeight,
      };
    });
    expect(panned.scale).toBeCloseTo(zoomed.scale, 1);
    expect(Math.abs(panned.panX)).toBeLessThanOrEqual((panned.scale - 1) * panned.width / 2 + 1);
    expect(Math.abs(panned.panY)).toBeLessThanOrEqual((panned.scale - 1) * panned.height / 2 + 1);
    expect(panned.panX - zoomed.panX).toBeGreaterThan(0);
    expect(panned.panY - zoomed.panY).toBeGreaterThan(0);

    // Releasing the pinch must retain the zoom, then a normal one-finger
    // horizontal touch swipe must still flip this same physical record.
    await dispatchTouchPointer('pointerup', 11, firstZoom.x + 20, firstZoom.y + 14, true);
    await dispatchTouchPointer('pointerup', 12, secondZoom.x + 20, secondZoom.y + 14, false);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-zoomed') && !card.classList.contains('is-zooming')
    )).toBe(true);

    const flipBounds = await stage.boundingBox();
    if (!flipBounds) throw new Error('Zoomed sleeve has no bounding box');
    const flipCenterX = flipBounds.x + flipBounds.width / 2;
    const flipCenterY = flipBounds.y + flipBounds.height / 2;
    await dispatchTouchPointer('pointerdown', 13, flipCenterX + 55, flipCenterY, true);
    await dispatchTouchPointer('pointermove', 13, flipCenterX - 55, flipCenterY, true);
    await dispatchTouchPointer('pointerup', 13, flipCenterX - 55, flipCenterY, true);

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
    // End the remaining contact as well so the next pinch starts with two fresh pointers.
    await dispatchTouchPointer('pointerup', 21, currentX - 5, currentY, true);

    // An idle timeout must never fire while both fingers are still touching
    // the sleeve. It starts only after the pinch interaction ends.
    await dispatchTouchPointer('pointerdown', 31, currentX - 40, currentY, true);
    await dispatchTouchPointer('pointerdown', 32, currentX + 40, currentY, false);
    await dispatchTouchPointer('pointerdown', 33, currentX, currentY + 40, false);
    await dispatchTouchPointer('pointermove', 31, currentX - 90, currentY, true);
    await dispatchTouchPointer('pointermove', 32, currentX + 90, currentY, false);
    await page.clock.fastForward(5100);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-zoomed')
    )).toBe(true);

    await dispatchTouchPointer('pointerup', 31, currentX - 90, currentY, true);
    await page.clock.fastForward(5100);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-zoomed')
    )).toBe(true);

    // The last finger leaving the sleeve starts the five-second idle window.
    await dispatchTouchPointer('pointerup', 32, currentX + 90, currentY, false);
    await page.clock.fastForward(5100);
    expect(await page.locator('[data-dig-slide].is-active [data-dig-sleeve-card]').evaluate((card) =>
      card.classList.contains('is-zoomed')
    )).toBe(true);

    // The third contact also keeps the zoom alive until it leaves the sleeve.
    await dispatchTouchPointer('pointerup', 33, currentX, currentY + 40, false);
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
    const outgoingCard = page.locator('[data-dig-slide]').first().locator('[data-dig-sleeve-card]');
    expect(await outgoingCard.evaluate((card) => card.classList.contains('is-zoomed'))).toBe(true);

    await swipeActive(0, -120);
    const outgoingZoomState = await outgoingCard.evaluate((card) => {
      const element = card as HTMLElement;
      return {
        zoomed: card.classList.contains('is-zoomed'),
        scale: element.style.getPropertyValue('--dig-zoom-scale'),
        panX: element.style.getPropertyValue('--dig-zoom-pan-x'),
        panY: element.style.getPropertyValue('--dig-zoom-pan-y'),
      };
    });
    expect(outgoingZoomState).toEqual({ zoomed: false, scale: '', panX: '', panY: '' });
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

  it('uses the supplied crate and keeps one filter surface inside the mobile Records/People drawer', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadPage(375, 812);

    expect(await page.locator('[data-dig-crate-source] img').getAttribute('src')).toBe('/assets/UI/dig_crate.webp');
    expect(await page.locator('[data-dig-crate-source] img').getAttribute('alt')).toBe('');
    expect(await page.locator('[data-dig-sound-toggle]').isVisible()).toBe(true);

    const trigger = page.locator('[data-dig-crate-toolbar] [data-dig-drawer-open]');
    const sidebar = page.locator('[data-dig-sidebar]');
    const filterForm = sidebar.locator('.dig-filter-form');

    expect(await trigger.isVisible()).toBe(true);
    expect(await sidebar.isVisible()).toBe(false);
    expect(await page.locator('.dig-crate-toolbar > *').count()).toBe(2);
    expect(await page.locator('.dig-crate-toolbar [data-dig-drawer-open]').isVisible()).toBe(true);
    expect(await page.locator('.dig-crate-toolbar [data-dig-sound-toggle]').isVisible()).toBe(true);
    expect(await page.locator('[data-dig-filter-open]').count()).toBe(0);
    expect(await page.locator('[data-dig-filter-dialog]').count()).toBe(0);
    expect(await page.locator('.dig-crate-filter-form').count()).toBe(0);
    expect(await page.locator('.dig-filter-form').count()).toBe(1);

    await trigger.click();
    expect(await sidebar.isVisible()).toBe(true);
    expect(await sidebar.getAttribute('role')).toBe('dialog');
    expect(await sidebar.getAttribute('aria-modal')).toBe('true');
    expect(await trigger.getAttribute('aria-expanded')).toBe('true');
    expect(await page.locator('.dig-drawer-backdrop').isVisible()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-dig-drawer-close'))).not.toBeNull();

    expect(await filterForm.getAttribute('action')).toBe('/dig');
    expect(await page.locator('#dig-primary-search').inputValue()).toBe('De La Soul');
    expect(await filterForm.locator('input[name="q"]').inputValue()).toBe('De La Soul');
    expect(await filterForm.locator('#dig-filter-query').isVisible()).toBe(true);
    expect(await filterForm.locator('#dig-filter-query').inputValue()).toBe('De La Soul');
    expect(await filterForm.locator('#filter-genre').inputValue()).toBe('Hip Hop');
    expect(await filterForm.locator('#filter-style').inputValue()).toBe('House');
    expect(await filterForm.locator('#filter-condition').inputValue()).toBe('VG+');
    expect(await filterForm.locator('#filter-min-price').inputValue()).toBe('10.00');
    expect(await filterForm.locator('#filter-max-price').inputValue()).toBe('50.00');
    expect(await filterForm.locator('#filter-sort').inputValue()).toBe('price_asc');
    expect(await filterForm.locator('input[name="whiteLabel"]').inputValue()).toBe('1');
    expect(await filterForm.locator('button[name="whiteLabelToggle"]').getAttribute('aria-pressed')).toBe('true');
    expect(await filterForm.locator('input[type="hidden"][name="format"]').evaluateAll((elements) =>
      elements.map((element) => (element as HTMLInputElement).value)
    )).toEqual(['LP', '7-inch']);

    await filterForm.locator('#filter-min-price').fill('15.00');
    await filterForm.locator('#dig-filter-query').fill('Prince');
    expect(await page.locator('#dig-primary-search').inputValue()).toBe('Prince');
    expect(await filterForm.locator('input[name="q"]').inputValue()).toBe('Prince');

    await page.locator('[data-dig-drawer-close]').click();
    expect(await sidebar.isVisible()).toBe(false);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');
    expect(await page.evaluate(() => document.activeElement?.matches('[data-dig-drawer-open]'))).toBe(true);

    await trigger.click();
    expect(await filterForm.locator('#filter-min-price').inputValue()).toBe('15.00');
    expect(await filterForm.locator('input[name="q"]').inputValue()).toBe('Prince');
    await page.keyboard.press('Escape');
    expect(await sidebar.isVisible()).toBe(false);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the mobile drawer and filter actions inside the viewport on short and standard phones', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    for (const viewport of [
      { width: 320, height: 640 },
      { width: 375, height: 812 },
    ]) {
      await loadPage(viewport.width, viewport.height);
      const trigger = page.locator('[data-dig-crate-toolbar] [data-dig-drawer-open]');
      const sidebar = page.locator('[data-dig-sidebar]');
      await trigger.click();

      const geometry = await sidebar.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          position: getComputedStyle(element).position,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      });
      expect(geometry.position).toBe('fixed');
      expect(geometry.top).toBe(0);
      expect(geometry.left).toBe(0);
      expect(geometry.width).toBeLessThanOrEqual(Math.min(360, viewport.width));
      expect(geometry.height).toBeGreaterThanOrEqual(viewport.height - 1);

      await sidebar.locator('.browse-filter-action-buttons').scrollIntoViewIfNeeded();
      const actionGeometry = await page.evaluate(() => {
        const sidebarElement = document.querySelector('[data-dig-sidebar]') as HTMLElement | null;
        const navigation = document.querySelector('.mobile-bottom-nav') as HTMLElement | null;
        const actions = document.querySelector('.dig-filter-form .browse-filter-action-buttons') as HTMLElement | null;
        if (!sidebarElement || !navigation || !actions) throw new Error('Sidebar, actions or navigation missing');
        const sidebarRect = sidebarElement.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        return {
          sidebarBottom: sidebarRect.bottom,
          actionsBottom: actionsRect.bottom,
          navigationZIndex: getComputedStyle(navigation).zIndex,
          sidebarZIndex: getComputedStyle(sidebarElement).zIndex,
          backdropZIndex: getComputedStyle(document.querySelector('.dig-drawer-backdrop') as HTMLElement).zIndex,
        };
      });
      expect(actionGeometry.actionsBottom).toBeLessThanOrEqual(actionGeometry.sidebarBottom + 1);
      expect(actionGeometry.navigationZIndex).toBe('200');
      expect(actionGeometry.backdropZIndex).toBe('999');
      expect(actionGeometry.sidebarZIndex).toBe('1000');

      await page.locator('.dig-drawer-backdrop').click({
        position: { x: viewport.width - 2, y: Math.floor(viewport.height / 2) },
      });
      expect(await sidebar.isVisible()).toBe(false);
      expect(await trigger.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('fits the open Dig drawer to the visible viewport while the software keyboard is open', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const viewport of [
      { width: 320, height: 640 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await loadPage(viewport.width, viewport.height, items, true);
      const trigger = page.locator('[data-dig-crate-toolbar] [data-dig-drawer-open]');
      const sidebar = page.locator('[data-dig-sidebar]');
      await trigger.click();

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

      await page.waitForFunction(() => {
        const element = document.querySelector('[data-dig-sidebar]') as HTMLElement | null;
        return Boolean(element &&
          element.style.getPropertyValue('--dig-sidebar-viewport-height') &&
          element.style.getPropertyValue('--dig-sidebar-viewport-top'));
      });
      const keyboardGeometry = await sidebar.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, height: rect.height, computedHeight: getComputedStyle(element).height };
      });
      expect(keyboardGeometry.top).toBe(keyboardOffsetTop);
      expect(keyboardGeometry.height).toBe(keyboardHeight);
      expect(keyboardGeometry.computedHeight).toBe(keyboardHeight + 'px');

      await sidebar.locator('.browse-secondary-filters').evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });
      expect(await sidebar.locator('#filter-max-price').isVisible()).toBe(true);
      await sidebar.locator('#filter-max-price').focus();
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-dig-sidebar]') as HTMLElement | null;
        const control = element?.querySelector('#filter-max-price') as HTMLElement | null;
        if (!element || !control) return false;
        const drawerRect = element.getBoundingClientRect();
        const controlRect = control.getBoundingClientRect();
        return controlRect.top >= drawerRect.top + 8 && controlRect.bottom <= drawerRect.bottom - 8;
      });

      await page.evaluate((layoutHeight) => {
        const visualViewport = (window as Window & {
          __digTestVisualViewport?: EventTarget & { height: number; offsetTop: number };
        }).__digTestVisualViewport;
        if (!visualViewport) throw new Error('Test visual viewport was not installed');
        visualViewport.height = layoutHeight;
        visualViewport.offsetTop = 0;
        visualViewport.dispatchEvent(new Event('resize'));
      }, viewport.height);
      await page.waitForFunction((expectedHeight) => {
        const element = document.querySelector('[data-dig-sidebar]') as HTMLElement | null;
        return Boolean(element &&
          element.style.getPropertyValue('--dig-sidebar-viewport-height') === expectedHeight + 'px' &&
          element.style.getPropertyValue('--dig-sidebar-viewport-top') === '0px');
      }, viewport.height);
      expect(await sidebar.evaluate((element) => element.getBoundingClientRect().height))
        .toBeGreaterThanOrEqual(viewport.height - 1);
      await page.keyboard.press('Escape');
      expect(await sidebar.isVisible()).toBe(false);
    }
  });

  it('closes the mobile drawer immediately when reduced motion is requested', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadPage(375, 812);
    const trigger = page.locator('[data-dig-crate-toolbar] [data-dig-drawer-open]');
    const sidebar = page.locator('[data-dig-sidebar]');
    await trigger.click();
    expect(await sidebar.isVisible()).toBe(true);
    expect(await sidebar.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
    await page.locator('[data-dig-drawer-close]').click();
    expect(await sidebar.isVisible()).toBe(false);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps Dig filters available when the mobile crate has no matching records', async () => {
    await loadPage(375, 812, []);
    expect(await page.locator('[data-dig-crate-toolbar]').count()).toBe(1);
    expect(await page.locator('[data-dig-sound-toggle]').isVisible()).toBe(true);
    expect(await page.locator('[data-dig-crate-source]').count()).toBe(0);
    expect(await page.locator('[data-dig-filter-dialog]').count()).toBe(0);
    expect(await page.locator('.dig-crate-filter-form').count()).toBe(0);
    expect(await page.locator('.dig-filter-form').count()).toBe(1);
    expect(await page.locator('[data-dig-crate-toolbar] [data-dig-drawer-open]').isVisible()).toBe(true);
    await page.locator('[data-dig-crate-toolbar] [data-dig-drawer-open]').click();
    expect(await page.locator('[data-dig-sidebar]').isVisible()).toBe(true);
    expect(await page.locator('.dig-filter-form').isVisible()).toBe(true);
  });

  it('keeps the Dig heading, search and view controls stable across tablet and desktop breakpoints', async () => {
    await loadPage(768, 900);

    for (const width of [768, 1024, 1280, 1440]) {
      if (width !== 768) await page.setViewportSize({ width, height: 900 });
      expect(await page.locator('.mobile-context-header').isVisible()).toBe(false);
      expect(await page.locator('.browse-header h1').isVisible()).toBe(true);
      expect(await page.locator('.dig-page-header h1').isVisible()).toBe(false);
      expect(await page.locator('.dig-search-control-bar').isVisible()).toBe(true);
      expect(await page.locator('.dig-responsive-desktop').isVisible()).toBe(true);
      expect(await page.locator('.dig-responsive-mobile').isVisible()).toBe(false);
      expect(await page.locator('.mobile-dig-back').isVisible()).toBe(false);
      expect(await page.locator('[data-dig-crate-toolbar]').isVisible()).toBe(false);

      const trigger = page.locator('.dig-search-control-bar [data-dig-drawer-open]');
      const sidebar = page.locator('[data-dig-sidebar]');
      if (width < 1024) {
        expect(await trigger.isVisible()).toBe(true);
        expect(await sidebar.isVisible()).toBe(false);
        await trigger.click();
        expect(await sidebar.isVisible()).toBe(true);
      } else {
        expect(await trigger.isVisible()).toBe(false);
        expect(await sidebar.isVisible()).toBe(true);
      }

      await sidebar.locator('.browse-secondary-filters').evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });

      const toolbarMetrics = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error('Missing Dig control: ' + selector);
          const bounds = element.getBoundingClientRect();
          return {
            height: bounds.height,
            centerY: bounds.top + bounds.height / 2,
          };
        };
        const controls = [
          rect('#dig-primary-search'),
          rect('.dig-primary-search-form > button[type="submit"]'),
          rect('.dig-search-control-bar > .view-mode-toggle'),
        ];
        const format = rect('.dig-sidebar .browse-format-chip');
        const genre = rect('.dig-sidebar #filter-genre');
        const sort = rect('.dig-sidebar #filter-sort');
        const actions = Array.from(document.querySelectorAll('.dig-sidebar .browse-filter-action-buttons .btn'))
          .map((element) => (element as HTMLElement).getBoundingClientRect().height);
        return {
          controls,
          format,
          genre,
          sort,
          actions,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        };
      });

      expect(toolbarMetrics.controls.map((control) => control.height)).toEqual([44, 44, 44]);
      const centers = toolbarMetrics.controls.map((control) => control.centerY);
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
      expect(toolbarMetrics.format.height).toBe(44);
      expect(toolbarMetrics.genre.height).toBe(44);
      expect(toolbarMetrics.sort.height).toBe(44);
      expect(toolbarMetrics.actions.length).toBeGreaterThan(0);
      expect(toolbarMetrics.actions.every((height) => height === 44)).toBe(true);
      expect(toolbarMetrics.documentWidth).toBeLessThanOrEqual(width + 1);
      expect(toolbarMetrics.bodyWidth).toBeLessThanOrEqual(width + 1);

      if (width === 768) {
        await page.keyboard.press('Escape');
        expect(await sidebar.isVisible()).toBe(false);
      }
    }
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(1440);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(1440);
  });

  it('keeps the sound toggle functional when the Dig result set is empty', async () => {
    await loadPage(375, 812, []);

    const soundToggle = page.locator('[data-dig-sound-toggle]');
    expect(await soundToggle.isVisible()).toBe(true);
    expect(await soundToggle.getAttribute('aria-pressed')).toBe('true');
    await soundToggle.click();

    expect(await soundToggle.getAttribute('aria-pressed')).toBe('false');
    expect(await page.evaluate(() => (
      window as Window & { VinylDropPreferences?: { get(key: string): boolean } }
    ).VinylDropPreferences?.get('soundEffectsEnabled'))).toBe(false);
    expect(await page.evaluate(() => (window as Window & { __digPlayedSounds?: string[] }).__digPlayedSounds || [])).toEqual([]);
  });

  it('plays the sleeve-flip sound for committed horizontal swipes with both motion preferences', async () => {
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      await page.emulateMedia({ reducedMotion });
      await loadPage(375, 812);

      const stage = page.locator('.dig-slide.is-active [data-dig-swipe-area]');
      const bounds = await stage.boundingBox();
      if (!bounds) throw new Error('Active Dig sleeve stage was not laid out');
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + 100, centerY, { steps: 6 });
      await page.mouse.up();

      expect(await page.locator('.dig-slide.is-active [data-dig-flip]').getAttribute('aria-pressed')).toBe('true');
      expect(await page.evaluate(() => (window as Window & { __digPlayedSounds?: string[] }).__digPlayedSounds || [])).toEqual([
        '/assets/sounds/dig/sleeve-flip.wav',
      ]);
    }
  });

  it('does not play a sound for short, cancelled or invalid-boundary sleeve gestures', async () => {
    await loadPage(375, 812);
    const stage = page.locator('[data-dig-swipe-area]').first();
    const bounds = await stage.boundingBox();
    if (!bounds) throw new Error('Dig sleeve stage was not laid out');

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    // A pointer press/release without crossing the swipe threshold is silent.
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.up();

    // A cancelled horizontal gesture must not be mistaken for a committed flip.
    const pointerIdPromise = page.evaluate(() => new Promise<number>((resolve) => {
      const activeStage = document.querySelector('[data-dig-swipe-area]');
      if (!activeStage) throw new Error('Dig sleeve stage was not found');
      activeStage.addEventListener('pointerdown', (event) => resolve((event as PointerEvent).pointerId), { once: true });
    }));
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    const pointerId = await pointerIdPromise;
    await page.mouse.move(centerX + 36, centerY + 4, { steps: 3 });
    await stage.dispatchEvent('pointercancel', {
      bubbles: true,
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
    });
    await page.mouse.up();

    // Swiping down from the first record has no previous record to restore.
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX, centerY + 90, { steps: 5 });
    await page.mouse.up();

    expect(await page.evaluate(() => (window as Window & { __digPlayedSounds?: string[] }).__digPlayedSounds?.length || 0)).toBe(0);
    expect(await page.locator('[data-dig-prev]').isDisabled()).toBe(true);
  });

});
