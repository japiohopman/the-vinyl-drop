import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import path from 'path';
import { mkdirSync, readFileSync } from 'fs';
import sharp from 'sharp';
import { chromium, Browser, Page } from 'playwright';
import {
  LISTING_PHOTO_ROLES,
  LISTING_PHOTO_ROLE_GUIDANCE,
  LISTING_PHOTO_ROLE_LABELS,
  NEW_LISTING_PHOTO_ROLES,
} from '../src/domain/listingPhotoRole';

describe('Square cover photo cropper', () => {
  jest.setTimeout(30000);

  const viewPath = path.join(__dirname, '../views/listings/edit.ejs');
  const stylesheet = readFullStylesheetSource();
  const corePath = path.join(__dirname, '../public/js/listing-photo-editor-core.js');
  const cropperPath = path.join(__dirname, '../public/js/square-photo-cropper.js');
  const issue333EvidenceDirectory = process.env.ISSUE_333_EVIDENCE_DIR;
  let browser: Browser;
  let page: Page;
  let portraitImage: Buffer;
  let browserErrors: string[];

  beforeAll(async () => {
    if (issue333EvidenceDirectory) mkdirSync(issue333EvidenceDirectory, { recursive: true });
    browser = await chromium.launch({ headless: true });
    portraitImage = await sharp({
      create: { width: 300, height: 500, channels: 3, background: { r: 175, g: 60, b: 90 } },
    }).jpeg().toBuffer();
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    browserErrors = [];
    page.on('pageerror', (error) => {
      browserErrors.push(error.message);
      console.error('[cropper browser error]', error.message);
    });
    await page.setViewportSize({ width: 375, height: 850 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  async function renderEditPage(
    existingPhoto?: {
      id: string;
      role: string;
      publicUrl: string;
      altText: string;
      editorState?: Record<string, unknown>;
      sourceIsLegacy?: boolean;
    },
    standaloneMode: 'browser' | 'display-mode' | 'ios' = 'browser',
  ): Promise<void> {
    const html = await ejs.renderFile(viewPath, {
      listing: {
        id: '11111111-1111-4111-8111-111111111111',
        price: 2500,
        tradeAvailable: false,
        description: '',
      },
      release: { title: 'Kind of Blue', artist: 'Miles Davis', releaseYear: 1959 },
      physicalCopy: { mediaCondition: 'NM', sleeveCondition: 'VG+', notes: '' },
      photos: existingPhoto ? [{
        ...existingPhoto,
        listingId: '11111111-1111-4111-8111-111111111111',
        displayOrder: 0,
      }] : [],
      form: { values: {}, fieldErrors: {}, generalErrors: [] },
      photoRoles: LISTING_PHOTO_ROLES,
      newPhotoRoles: NEW_LISTING_PHOTO_ROLES,
      photoRoleLabels: LISTING_PHOTO_ROLE_LABELS,
      photoRoleGuidance: LISTING_PHOTO_ROLE_GUIDANCE,
      photoError: '',
    }, { filename: viewPath });

    const body = html
      .replace('<script src="/js/listing-photo-editor-core.js" defer></script>', '')
      .replace('<script src="/js/square-photo-cropper.js" defer></script>', '');
    await page.setContent(
      '<!doctype html><html lang="en"><head><meta charset="UTF-8">' +
      '<base href="http://localhost/">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<style>' + stylesheet + '</style></head>' +
      '<body><main class="main-content">' + body + '</main></body></html>',
      { waitUntil: 'domcontentloaded', timeout: 5000 }
    );
    await page.route('**/js/vendor/scanic/scanic.js', (route) => route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
      body: readFileSync(path.join(__dirname, '../public/js/vendor/scanic/scanic.js'), 'utf8'),
    }));
    if (standaloneMode === 'display-mode') {
      await page.addScriptTag({
        content: "Object.defineProperty(window, 'matchMedia', { configurable: true, value: query => ({ matches: query === '(display-mode: standalone)' }) });",
      });
    } else if (standaloneMode === 'ios') {
      await page.addScriptTag({
        content: "Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });",
      });
    }
    await page.addScriptTag({ path: corePath });
    await page.addScriptTag({ path: cropperPath });
  }

  async function selectPortrait(role: string): Promise<void> {
    const uploadDialog = page.locator('#photoUploadDialog');
    if (await uploadDialog.isVisible()) {
      await page.locator('[data-close-photo-upload]').first().click({ timeout: 5000 });
    }

    const slot = role === 'front_cover' || role === 'back_cover'
      ? '[data-open-photo-upload][data-photo-role="' + role + '"]'
      : '[data-open-photo-upload][data-photo-role="optional"]';
    if (role !== 'front_cover' && role !== 'back_cover') {
      const additional = page.locator('details.additional-photos');
      if (!(await additional.evaluate((element) => (element as unknown as { open: boolean }).open))) {
        await additional.locator('summary').click({ timeout: 5000 });
      }
    }
    await page.locator(slot).click({ timeout: 5000 });
    if (role !== 'front_cover' && role !== 'back_cover') {
      await page.locator('#newPhotoRole').selectOption(role, { timeout: 5000 });
    }
    await page.locator('#altText').fill('Full physical sleeve cover', { timeout: 5000 });
    await page.locator('#photoFile').setInputFiles({
      name: role + '-phone-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: portraitImage,
    }, { timeout: 5000 });
  }

  it('shows existing cover photos in their own slots and opens help on demand', async () => {
    await renderEditPage({
      id: '22222222-2222-4222-8222-222222222222',
      role: 'front_cover',
      publicUrl: 'data:image/jpeg;base64,' + portraitImage.toString('base64'),
      altText: 'Front sleeve with a small crease',
    });

    expect(await page.locator('[data-cover-slot="front_cover"] .listing-photo-image').count()).toBe(1);
    expect(await page.locator('[data-cover-slot="back_cover"] .listing-photo-image').count()).toBe(0);
    expect(await page.locator('[data-cover-slot="back_cover"] [data-open-photo-upload]').count()).toBe(1);
    expect(await page.locator('[data-cover-slot="front_cover"] .cover-photo-status').textContent()).toContain('Photo added');

    const pageHtml = await page.content();
    expect(pageHtml).not.toContain('Alt-tekst');
    expect(pageHtml).not.toContain('Voorkant');
    expect(pageHtml).toContain('Front cover');
    expect(pageHtml).toContain('Back cover');
    expect(pageHtml).toContain('Choose photo');

    await page.locator('[data-open-photo-help]').click({ timeout: 5000 });
    expect(await page.locator('#photoHelpDialog').isVisible()).toBe(true);
    expect(await page.locator('#photoHelpDialog').innerText()).toContain('whole sleeve visible');
    await page.keyboard.press('Escape');
    expect(await page.locator('#photoHelpDialog').isVisible()).toBe(false);
  });

  it('keeps the normal picker in browser mode and exposes camera capture only in standalone mode', async () => {
    await renderEditPage();

    expect(await page.locator('#photoCameraInput').getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    expect(await page.locator('#photoCameraInput').getAttribute('capture')).toBe('environment');
    expect(await page.locator('#photoFile').getAttribute('capture')).toBeNull();
    await page.locator('[data-open-photo-upload][data-photo-role="front_cover"]').click({ timeout: 5000 });
    expect(await page.locator('[data-photo-camera-trigger]').isHidden()).toBe(true);
    expect(await page.locator('label[for="photoFile"]').isVisible()).toBe(true);

    await renderEditPage(undefined, 'display-mode');
    await page.locator('[data-open-photo-upload][data-photo-role="front_cover"]').click({ timeout: 5000 });
    expect(await page.locator('[data-photo-camera-trigger]').isVisible()).toBe(true);
    expect(await page.locator('label[for="photoFile"]').isVisible()).toBe(true);

    await renderEditPage(undefined, 'ios');
    await page.locator('[data-open-photo-upload][data-photo-role="front_cover"]').click({ timeout: 5000 });
    expect(await page.locator('[data-photo-camera-trigger]').isVisible()).toBe(true);
  });

  it('hands standalone camera captures into the existing photo editor and resets for repeat captures', async () => {
    await renderEditPage(undefined, 'display-mode');
    await page.locator('[data-open-photo-upload][data-photo-role="front_cover"]').click({ timeout: 5000 });

    const cameraTrigger = page.locator('[data-photo-camera-trigger]');
    expect(await cameraTrigger.isVisible()).toBe(true);

    for (const width of [360, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      const layout = await page.evaluate(() => {
        const actions = document.querySelector('[data-photo-file-actions]');
        const choose = actions?.querySelector('label');
        const camera = actions?.querySelector('button');
        if (!choose || !camera) return null;
        const chooseRect = choose.getBoundingClientRect();
        const cameraRect = camera.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          chooseLeft: chooseRect.left,
          chooseRight: chooseRect.right,
          chooseWidth: chooseRect.width,
          cameraLeft: cameraRect.left,
          cameraRight: cameraRect.right,
          cameraWidth: cameraRect.width,
        };
      });
      expect(layout).not.toBeNull();
      expect(layout!.document).toBeLessThanOrEqual(width + 1);
      expect(layout!.body).toBeLessThanOrEqual(width + 1);
      expect(layout!.chooseWidth).toBeGreaterThan(100);
      expect(layout!.cameraWidth).toBeGreaterThan(100);
      expect(layout!.cameraLeft).toBeGreaterThanOrEqual(layout!.chooseRight - 1);
      expect(layout!.cameraRight).toBeLessThanOrEqual(width + 1);
    }

    await cameraTrigger.focus();
    expect(await cameraTrigger.evaluate((button) => document.activeElement === button)).toBe(true);
    const firstChooserPromise = page.waitForEvent('filechooser');
    await cameraTrigger.press('Enter', { timeout: 5000 });
    const firstChooser = await firstChooserPromise;
    await firstChooser.setFiles({
      name: 'camera-front-cover.jpg',
      mimeType: 'image/jpeg',
      buffer: portraitImage,
    });

    await page.waitForFunction(
      "document.querySelector('#photoFile').files?.[0]?.name === 'camera-front-cover.jpg' && " +
      "document.querySelector('#square-cover-source').height === 320",
      undefined,
      { timeout: 5000 }
    );
    expect(await page.locator('#photoOriginalFile').evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe('camera-front-cover.jpg');
    expect(await page.locator('#photoCameraInput').inputValue()).toBe('');

    const cancelledChooserPromise = page.waitForEvent('filechooser');
    await cameraTrigger.click({ timeout: 5000 });
    const cancelledChooser = await cancelledChooserPromise;
    await cancelledChooser.setFiles([]);
    expect(await page.locator('#photoFile').evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe('camera-front-cover.jpg');
    expect(await page.locator('#photoCameraInput').inputValue()).toBe('');

    const secondChooserPromise = page.waitForEvent('filechooser');
    await cameraTrigger.click({ timeout: 5000 });
    const secondChooser = await secondChooserPromise;
    await secondChooser.setFiles({
      name: 'camera-front-cover-second.jpg',
      mimeType: 'image/jpeg',
      buffer: portraitImage,
    });

    await page.waitForFunction(
      "document.querySelector('#photoFile').files?.[0]?.name === 'camera-front-cover-second.jpg'",
      undefined,
      { timeout: 5000 }
    );
    expect(await page.locator('#photoOriginalFile').evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe('camera-front-cover-second.jpg');
    expect(await page.locator('#photoCameraInput').inputValue()).toBe('');
    expect(await page.locator('#square-cover-cropper').isVisible()).toBe(true);
  });

  it('preselects the matching role when a front or back slot opens the uploader', async () => {
    await renderEditPage();
    await page.locator('[data-open-photo-upload][data-photo-role="front_cover"]').click({ timeout: 5000 });
    expect(await page.locator('#photoUploadDialog').isVisible()).toBe(true);
    expect(await page.locator('#newPhotoRole').inputValue()).toBe('front_cover');
    expect(await page.locator('.photo-role-field').isVisible()).toBe(false);
    expect(await page.locator('#photo-role-guidance').isVisible()).toBe(false);
    expect(await page.evaluate("document.activeElement && document.activeElement.classList.contains('photo-file-trigger')")).toBe(true);
    expect(await page.locator('#altText').getAttribute('placeholder')).toBe('Front cover of the record sleeve');
    expect(await page.locator('#altText').getAttribute('required')).toBeNull();
    expect(await page.locator('#photoUploadTitle').textContent()).toBe('Upload front of your copy');

    await page.locator('[data-close-photo-upload]').first().click({ timeout: 5000 });
    await page.locator('[data-open-photo-upload][data-photo-role="back_cover"]').click({ timeout: 5000 });
    expect(await page.locator('#newPhotoRole').inputValue()).toBe('back_cover');
    expect(await page.locator('.photo-role-field').isVisible()).toBe(false);
    expect(await page.locator('#altText').getAttribute('placeholder')).toBe('Back cover of the record sleeve');
    expect(await page.locator('#altText').getAttribute('required')).toBeNull();
    expect(await page.locator('#photoUploadTitle').textContent()).toBe('Upload back of your copy');
  });

  it('rectifies front and back cover uploads to the exact square preview', async () => {
    await renderEditPage();

    await page.evaluate("(() => {" +
      "const form = document.querySelector('form[action$=\"/photos\"]');" +
      "form.addEventListener('submit', (event) => event.preventDefault(), true);" +
    "})()");

    const roles = ['front_cover', 'back_cover'];
    for (let index = 0; index < roles.length; index += 1) {
      const role = roles[index];
      await selectPortrait(role);
      await page.waitForFunction(
        "document.querySelector('#selected-photo-info').textContent.includes('300 × 500 px') && " +
        "document.querySelector('#square-cover-source').height === 320",
        undefined,
        { timeout: 5000 }
      );

      expect(await page.locator('#square-cover-cropper').isVisible()).toBe(true);
      expect(await page.locator('#square-cover-title').textContent()).toBe(
        role === 'front_cover' ? 'Square front cover correction' : 'Square back cover correction'
      );

      const topLeftHandle = page.locator('[data-corner-handle="0"]');
      const polygonBeforeNudge = await page.locator('#square-cover-polygon').getAttribute('points');
      await topLeftHandle.focus();
      expect(await topLeftHandle.isEnabled()).toBe(true);
      expect(await topLeftHandle.evaluate((handle) => document.activeElement === handle)).toBe(true);
      await topLeftHandle.press('ArrowRight');
      const polygonAfterNudge = await page.locator('#square-cover-polygon').getAttribute('points');
      expect(polygonAfterNudge).not.toBe(polygonBeforeNudge);
      expect(await page.locator('#square-cover-histogram').count()).toBe(1);
      expect(await page.locator('[data-photo-adjustment="shadows"]').inputValue()).toBe('0');

      await page.locator('[data-photo-editor-undo]').click();
      expect(await page.locator('#square-cover-polygon').getAttribute('points')).toBe(polygonBeforeNudge);
      await page.locator('[data-photo-editor-redo]').click();
      expect(await page.locator('#square-cover-polygon').getAttribute('points')).toBe(polygonAfterNudge);

      const beforeAfter = page.locator('[data-toggle-photo-before-after]');
      await beforeAfter.click();
      await page.waitForFunction(
        "document.querySelector('#square-cover-result').getContext('2d').getImageData(10, 256, 1, 1).data[0] === 255",
        undefined,
        { timeout: 5000 }
      );
      await beforeAfter.click();
      await page.waitForFunction(
        "document.querySelector('#square-cover-result').getContext('2d').getImageData(10, 256, 1, 1).data[0] < 240",
        undefined,
        { timeout: 5000 }
      );

      await page.getByText('Fine-tune tonal and colour controls').click();
      const exposure = page.locator('[data-photo-adjustment="exposure"]');
      const baselineRed = await page.locator('#square-cover-result').evaluate((canvas) =>
        (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(256, 256, 1, 1).data[0]
      );
      await exposure.evaluate((input) => {
        (input as HTMLInputElement).value = '25';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(
        (baseline) => {
          const canvas = document.querySelector('#square-cover-result') as HTMLCanvasElement;
          return canvas.getContext('2d')!.getImageData(256, 256, 1, 1).data[0] > baseline + 20;
        },
        baselineRed,
        { timeout: 5000 }
      );
      await page.locator('[data-photo-editor-reset]').click();
      await page.waitForFunction(
        (baseline) => {
          const canvas = document.querySelector('#square-cover-result') as HTMLCanvasElement;
          return Math.abs(canvas.getContext('2d')!.getImageData(256, 256, 1, 1).data[0] - baseline) <= 2;
        },
        baselineRed,
        { timeout: 5000 }
      );
      expect(await exposure.inputValue()).toBe('0');

      for (const width of [320, 360, 375, 414]) {
        await page.setViewportSize({ width, height: 850 });
        const layout = await page.evaluate("(() => {" +
          "const root = document.querySelector('.photos-section');" +
          "const cropper = document.querySelector('#square-cover-cropper');" +
          "const coverSlots = document.querySelector('.cover-photo-slots');" +
          "return {" +
            "viewport: window.innerWidth," +
            "section: root.getBoundingClientRect().width," +
            "sectionScroll: root.scrollWidth," +
            "coverSlots: coverSlots.getBoundingClientRect().width," +
            "coverSlotsScroll: coverSlots.scrollWidth," +
            "cropper: cropper.getBoundingClientRect().width," +
            "cropperScroll: cropper.scrollWidth" +
          "};" +
        "})()") as {
          viewport: number;
          section: number;
          sectionScroll: number;
          coverSlots: number;
          coverSlotsScroll: number;
          cropper: number;
          cropperScroll: number;
        };
        expect(layout.sectionScroll).toBeLessThanOrEqual(layout.section + 1);
        expect(layout.coverSlotsScroll).toBeLessThanOrEqual(layout.coverSlots + 1);
        expect(layout.cropperScroll).toBeLessThanOrEqual(layout.cropper + 1);
      }

      await page.locator('form[action$="/photos"] button[type="submit"]').click({ timeout: 5000 });
      await page.waitForFunction(
        `document.querySelector('form[action$="/photos"]').dataset.photoEditorReady === 'true'`,
        undefined,
        { timeout: 20000 }
      );
      expect(await page.locator('#photoOriginalFile').evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe(role + '-phone-photo.jpg');
      const savedEditState = JSON.parse(await page.locator('#photoEditorState').inputValue());
      expect(savedEditState.sourceWidth).toBe(300);
      expect(savedEditState.sourceHeight).toBe(500);

      const uploaded = await page.evaluate("(async () => {" +
        "const fileInput = document.querySelector('#photoFile');" +
        "const file = fileInput && fileInput.files && fileInput.files[0];" +
        "if (!file) throw new Error('The cropper did not replace the selected photo.');" +
        "const bitmap = await createImageBitmap(file);" +
        "const result = { name: file.name, type: file.type, width: bitmap.width, height: bitmap.height, size: file.size };" +
        "bitmap.close();" +
        "return result;" +
      "})()") as {
        name: string;
        type: string;
        width: number;
        height: number;
        size: number;
      };
      expect(uploaded.type).toBe('image/jpeg');
      expect(uploaded.width).toBe(1536);
      expect(uploaded.height).toBe(1536);
      expect(uploaded.size).toBeLessThanOrEqual(5 * 1024 * 1024);
      expect(uploaded.name).toContain(role + '-square.jpg');
    }
  });

  it('does not upload a stale correction after the seller cancels processing', async () => {
    await renderEditPage();
    await page.evaluate("(() => {" +
      "const originalToBlob = HTMLCanvasElement.prototype.toBlob;" +
      "HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {" +
        "originalToBlob.call(this, blob => window.setTimeout(() => callback(blob), 400), type, quality);" +
      "};" +
      "const form = document.querySelector('form[action$=\\\"/photos\\\"]');" +
      "form.addEventListener('submit', event => event.preventDefault(), true);" +
    "})()");

    await selectPortrait('front_cover');
    await page.waitForFunction(
      "document.querySelector('#selected-photo-info').textContent.includes('300 × 500 px')",
      undefined,
      { timeout: 5000 }
    );
    await page.locator('form[action$="/photos"] button[type="submit"]').click();
    await page.waitForFunction(
      "document.querySelector('form[action$=\\\"/photos\\\"] button[type=\\\"submit\\\"]').disabled",
      undefined,
      { timeout: 5000 }
    );

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    expect(await page.locator('#photoUploadDialog').isVisible()).toBe(false);
    expect(await page.locator('#photoFile').evaluate((input) => (input as HTMLInputElement).files?.length || 0)).toBe(0);
    expect(await page.locator('form[action$="/photos"]').getAttribute('data-photo-editor-ready')).toBeNull();
    expect(await page.locator('form[action$="/photos"] button[type="submit"]').isEnabled()).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  it('supports straighten, zoom and position controls as saved corner geometry', async () => {
    await renderEditPage();
    await selectPortrait('front_cover');
    await page.waitForFunction(
      "document.querySelector('#square-cover-source').height === 320",
      undefined,
      { timeout: 5000 }
    );

    await page.waitForFunction(
      "document.querySelector('#photoEditorState').value.includes('corners')",
      undefined,
      { timeout: 5000 }
    );
    const initialPolygon = await page.locator('#square-cover-polygon').getAttribute('points');
    const initialState = JSON.parse(await page.locator('#photoEditorState').inputValue());
    const changeFrame = async (key: string, value: string) => {
      const before = await page.locator('#square-cover-polygon').getAttribute('points');
      await page.locator('[data-photo-frame="' + key + '"]').evaluate((input, nextValue) => {
        (input as HTMLInputElement).value = String(nextValue);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await page.waitForFunction(
        (previous) => document.querySelector('#square-cover-polygon')?.getAttribute('points') !== previous,
        before,
        { timeout: 5000 }
      );
    };

    await changeFrame('rotation', '8');
    const rotatedPolygon = await page.locator('#square-cover-polygon').getAttribute('points');
    expect(rotatedPolygon).not.toBe(initialPolygon);
    expect(await page.locator('[data-photo-frame="rotation"]').inputValue()).toBe('0');
    await page.locator('[data-photo-editor-undo]').click();
    expect(await page.locator('#square-cover-polygon').getAttribute('points')).toBe(initialPolygon);
    await page.locator('[data-photo-editor-redo]').click();
    expect(await page.locator('#square-cover-polygon').getAttribute('points')).toBe(rotatedPolygon);

    await changeFrame('zoom', '90');
    const zoomedPolygon = await page.locator('#square-cover-polygon').getAttribute('points');
    expect(zoomedPolygon).not.toBe(rotatedPolygon);
    expect(await page.locator('[data-photo-frame="zoom"]').inputValue()).toBe('100');

    await changeFrame('offsetX', '1');
    const repositionedPolygon = await page.locator('#square-cover-polygon').getAttribute('points');
    expect(repositionedPolygon).not.toBe(zoomedPolygon);
    await page.waitForFunction(
      (before) => {
        try {
          const editorState = document.querySelector('#photoEditorState') as HTMLInputElement | null;
          if (!editorState) return false;
          const state = JSON.parse(editorState.value);
          return JSON.stringify(state.corners) !== JSON.stringify(before);
        } catch {
          return false;
        }
      },
      initialState.corners,
      { timeout: 5000 }
    );
    const state = JSON.parse(await page.locator('#photoEditorState').inputValue());
    expect(state.corners).toHaveLength(4);
    expect(state.corners).not.toEqual(initialState.corners);
    expect(await page.locator('[data-photo-frame="offsetX"]').inputValue()).toBe('0');
  });

  it('offers the full framing and tonal editor for additional photos without forcing a square crop', async () => {
    await renderEditPage();
    await selectPortrait('detail');
    expect(await page.locator('.photo-role-field').isVisible()).toBe(true);
    expect(await page.locator('#photo-role-guidance').isVisible()).toBe(true);
    expect(await page.locator('#altText').getAttribute('placeholder')).toBe('Describe what is visible, e.g. a crease or Side A label');
    expect(await page.locator('#altText').getAttribute('required')).not.toBeNull();

    await page.waitForFunction(
      "document.querySelector('#square-cover-source').height === 320",
      undefined,
      { timeout: 5000 }
    );
    expect(await page.locator('#square-cover-cropper').isVisible()).toBe(true);
    expect(await page.locator('#photo-original-preview').isVisible()).toBe(false);
    const resultDimensions = await page.locator('#square-cover-result').evaluate((canvas) => ({
      width: (canvas as HTMLCanvasElement).width,
      height: (canvas as HTMLCanvasElement).height,
    }));
    expect(resultDimensions.width).toBeLessThan(resultDimensions.height);
    const topLeftHandle = page.locator('[data-corner-handle="0"]');
    const polygonBeforeDrag = await page.locator('#square-cover-polygon').getAttribute('points');
    const handleBox = await topLeftHandle.boundingBox();
    if (!handleBox) throw new Error('The additional-photo corner handle is not visible.');
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2 + 8, { steps: 3 });
    await page.mouse.up();
    await page.waitForFunction(
      (before) => document.querySelector('#square-cover-polygon')?.getAttribute('points') !== before,
      polygonBeforeDrag,
      { timeout: 5000 }
    );
    expect(await page.locator('#selected-photo-info').textContent()).toContain('300 × 500 px');
    expect(JSON.parse(await page.locator('#photoEditorState').inputValue()).sourceWidth).toBe(300);
    expect(browserErrors).toEqual([]);
  });

  it('detects all four skewed sleeve edges and never overwrites a manual point edit', async () => {
    const sleeveSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">' +
      '<rect width="800" height="1000" fill="#55585b"/>' +
      '<polygon points="115,150 690,105 720,855 145,910" fill="#f0eadc" stroke="#111111" stroke-width="10"/>' +
      '<path d="M230 330 L570 295 M220 370 L570 340 M225 700 L580 670" stroke="#454545" stroke-width="5" opacity=".65"/>' +
      '</svg>'
    );
    const perspectiveSleeve = await sharp(sleeveSvg).jpeg({ quality: 95 }).toBuffer();

    await renderEditPage();
    await page.evaluate("document.querySelector('form[action$=\\\"/photos\\\"]').addEventListener('submit', event => event.preventDefault(), true)");
    await page.locator('[data-open-photo-upload][data-photo-role="front_cover"]').click({ timeout: 5000 });
    await page.locator('#altText').fill('Perspective photo of the front sleeve');
    await page.locator('#photoFile').setInputFiles({
      name: 'perspective-front-sleeve.jpg',
      mimeType: 'image/jpeg',
      buffer: perspectiveSleeve,
    });

    await page.waitForFunction(
      "document.querySelector('#square-cover-detection-status')?.textContent.includes('All four sleeve edges were detected')",
      undefined,
      { timeout: 30000 }
    );

    const geometry = await page.evaluate(() => {
      const polygon = document.querySelector('#square-cover-detect-polygon');
      const text = polygon?.getAttribute('points') || '';
      const corners = text.trim().split(/\\s+/).map((pair) => pair.split(',').map(Number));
      const edgeLengths = corners.map((point, index) => {
        const next = corners[(index + 1) % corners.length];
        return Math.hypot(next[0] - point[0], next[1] - point[1]);
      });
      const markers = Array.from(document.querySelectorAll('[data-detected-corner]'));
      const detectionStage = document.querySelector('#square-cover-detect-stage') as HTMLElement;
      const detectionBox = detectionStage.getBoundingClientRect();
      const manualPolygon = document.querySelector('#square-cover-polygon')?.getAttribute('points');
      return {
        corners,
        edgeLengths,
        markers: markers.filter((marker) => marker.getAttribute('display') !== 'none').length,
        manualMatchesDetection: manualPolygon === text,
        cornersInBounds: corners.every((point) => point[0] >= 2 && point[0] <= 254 && point[1] >= 2 && point[1] <= 318),
        detectionHeight: detectionBox.height,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(geometry.corners).toHaveLength(4);
    expect(new Set(geometry.corners.map((point) => point.join(','))).size).toBe(4);
    expect(geometry.edgeLengths.every((length) => length > 20)).toBe(true);
    expect(geometry.markers).toBe(4);
    expect(geometry.manualMatchesDetection).toBe(true);
    expect(geometry.cornersInBounds).toBe(true);
    await page.waitForFunction(
      "document.querySelector('#square-cover-status')?.textContent.includes('Preview updated')",
      undefined,
      { timeout: 5000 }
    );
    if (issue333EvidenceDirectory) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.square-cover-workflow').screenshot({
        path: path.join(issue333EvidenceDirectory, 'editor-mobile-workflow.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('.square-cover-workflow').screenshot({
        path: path.join(issue333EvidenceDirectory, 'editor-desktop-workflow.png'),
      });
    }

    const detectionOutline = await page.locator('#square-cover-detect-polygon').getAttribute('points');
    const firstHandle = page.locator('[data-corner-handle="0"]');
    await firstHandle.focus();
    await firstHandle.press('ArrowRight');
    expect(await page.locator('#square-cover-polygon').getAttribute('points')).not.toBe(detectionOutline);
    expect(await page.locator('#square-cover-detect-polygon').getAttribute('points')).toBe(detectionOutline);

    // Repeat with a landscape photo. The source canvas is 320x256, so this
    // also verifies that X/Y coordinates are scaled independently of portrait.
    await page.locator('[data-close-photo-upload]').first().click({ timeout: 5000 });
    await page.locator('[data-open-photo-upload][data-photo-role="back_cover"]').click({ timeout: 5000 });
    const landscapeSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800">' +
      '<rect width="1000" height="800" fill="#53565a"/>' +
      '<polygon points="105,100 900,145 855,705 130,680" fill="#f0eadc" stroke="#111111" stroke-width="11"/>' +
      '<path d="M260 280 L735 310 M250 325 L725 355 M235 590 L700 620" stroke="#454545" stroke-width="5" opacity=".65"/>' +
      '</svg>'
    );
    const landscapeSleeve = await sharp(landscapeSvg).jpeg({ quality: 95 }).toBuffer();
    await page.locator('#altText').fill('Perspective photo of the back sleeve');
    await page.locator('#photoFile').setInputFiles({
      name: 'perspective-back-sleeve-landscape.jpg',
      mimeType: 'image/jpeg',
      buffer: landscapeSleeve,
    });
    await page.waitForFunction(
      "document.querySelector('#square-cover-detection-status')?.textContent.includes('All four sleeve edges were detected')",
      undefined,
      { timeout: 30000 }
    );
    const landscapeGeometry = await page.evaluate(() => {
      const source = document.querySelector('#square-cover-source') as HTMLCanvasElement;
      const polygon = document.querySelector('#square-cover-detect-polygon');
      const points = (polygon?.getAttribute('points') || '').trim().split(/\\s+/)
        .map((pair) => pair.split(',').map(Number));
      const markers = Array.from(document.querySelectorAll('[data-detected-corner]'));
      const edgeLengths = points.map((point, index) => {
        const next = points[(index + 1) % points.length];
        return Math.hypot(next[0] - point[0], next[1] - point[1]);
      });
      return {
        width: source.width,
        height: source.height,
        points,
        edgeLengths,
        markers: markers.filter((marker) => marker.getAttribute('display') !== 'none').length,
        inBounds: points.every((point) => point[0] >= 2 && point[0] <= 318 && point[1] >= 2 && point[1] <= 254),
      };
    });
    expect(landscapeGeometry.width).toBe(320);
    expect(landscapeGeometry.height).toBe(256);
    expect(landscapeGeometry.points).toHaveLength(4);
    expect(landscapeGeometry.edgeLengths.every((length) => length > 20)).toBe(true);
    expect(landscapeGeometry.markers).toBe(4);
    expect(landscapeGeometry.inBounds).toBe(true);

    for (const width of [360, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      const dimensions = await page.evaluate(() => {
        const dialog = document.querySelector('#photoUploadDialog') as HTMLDialogElement;
        const workflow = document.querySelector('.square-cover-workflow') as HTMLElement;
        const panels = Array.from(workflow.children);
        const rects = panels.map((panel) => panel.getBoundingClientRect());
        return {
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          direction: getComputedStyle(workflow).flexDirection,
          order: panels.map((panel) => panel.classList.contains('square-cover-detect-panel')
            ? 'detect'
            : panel.classList.contains('square-cover-result-panel') ? 'preview' : 'points'),
          panelWidths: rects.map((rect) => rect.width),
          dialogWidth: dialog.getBoundingClientRect().width,
        };
      });
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(width + 1);
      expect(dimensions.direction).toBe('column');
      expect(dimensions.order).toEqual(['detect', 'preview', 'points']);
      expect(dimensions.panelWidths.every((panelWidth) => panelWidth > 0)).toBe(true);
      expect(dimensions.dialogWidth).toBeLessThanOrEqual(width + 1);
    }
    expect(browserErrors).toEqual([]);
  });

  it('reopens an existing private source and restores the saved edit recipe', async () => {
    const storedState = {
      version: 1,
      sourceWidth: 300,
      sourceHeight: 500,
      corners: [
        { x: 12, y: 20 },
        { x: 288, y: 20 },
        { x: 288, y: 480 },
        { x: 12, y: 480 },
      ],
      adjustments: {
        exposure: 0.5,
        blackPoint: 0,
        shadows: 10,
        contrast: 0,
        highlights: 0,
        whitePoint: 255,
        gamma: 1,
        temperature: 0,
        tint: 0,
        saturation: 0,
      },
    };
    const sourceBuffer = await sharp(portraitImage).webp({ lossless: true }).toBuffer();
    await renderEditPage({
      id: '22222222-2222-4222-8222-222222222222',
      role: 'front_cover',
      publicUrl: 'data:image/jpeg;base64,' + portraitImage.toString('base64'),
      altText: 'Front sleeve with a small crease',
      editorState: storedState,
      sourceIsLegacy: false,
    });
    await page.route('**/listings/**/editor-source', (route) => route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'X-Photo-Source-Width': '300',
        'X-Photo-Source-Height': '500',
        'X-Photo-Source-Legacy': 'false',
      },
      body: sourceBuffer,
    }));
    await page.evaluate("document.querySelector('#photoUploadForm').addEventListener('submit', event => event.preventDefault(), true)");
    await page.locator('[data-open-existing-photo-editor]').click({ timeout: 5000 });
    await page.waitForFunction(
      "document.querySelector('#photoUploadDialog')?.open === true",
      undefined,
      { timeout: 5000 }
    );

    expect(await page.locator('#photoUploadDialog').isVisible()).toBe(true);
    expect(await page.locator('#photoUploadForm').getAttribute('action')).toContain('/photos/22222222-2222-4222-8222-222222222222/edit');
    expect(await page.locator('label.photo-file-trigger').isVisible()).toBe(false);
    expect(await page.locator('[data-photo-camera-trigger]').isVisible()).toBe(false);
    expect(await page.locator('#photoOriginalFile').evaluate((input) => (input as HTMLInputElement).files?.length || 0)).toBe(0);
    expect(await page.locator('#photo-editor-source-notice').isVisible()).toBe(false);
    expect(await page.locator('[data-photo-adjustment="exposure"]').inputValue()).toBe('25');

    const polygon = await page.locator('#square-cover-polygon').getAttribute('points');
    expect(polygon).toContain('7.68');
    await page.locator('#photoUploadForm button[type="submit"]').click();
    await page.waitForFunction(
      "document.querySelector('#photoUploadForm').dataset.photoEditorReady === 'true'",
      undefined,
      { timeout: 20000 }
    );
    expect(await page.locator('#photoUploadForm').getAttribute('action')).toContain('/edit');
    expect(browserErrors).toEqual([]);
  });

  it('supports four-point dragging with touch input on a phone-sized viewport', async () => {
    await page.close();
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await renderEditPage();
    await page.evaluate("document.querySelector('form[action$=\\\"/photos\\\"]').addEventListener('submit', event => event.preventDefault(), true)");
    await page.locator('[data-open-photo-upload][data-photo-role="front_cover"]').click();
    await page.locator('#altText').fill('Touch-edited sleeve photo');
    await page.locator('#photoFile').setInputFiles({
      name: 'touch-front-cover.jpg',
      mimeType: 'image/jpeg',
      buffer: portraitImage,
    });
    await page.waitForFunction(
      "document.querySelector('#square-cover-source')?.height === 320 && " +
      "document.querySelector('[data-corner-handle=\\\"0\\\"]')?.disabled === false",
      undefined,
      { timeout: 5000 }
    );

    const handle = page.locator('[data-corner-handle="0"]');
    const original = await page.locator('#square-cover-polygon').getAttribute('points');
    const bounds = await handle.boundingBox();
    if (!bounds) throw new Error('The first manual corner handle is not visible for touch input.');
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await handle.evaluate((element, point) => {
      const target = element as HTMLButtonElement;
      target.setPointerCapture = () => undefined;
      target.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 17, pointerType: 'touch',
        isPrimary: true, clientX: point.x, clientY: point.y,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId: 17, pointerType: 'touch',
        isPrimary: true, clientX: point.x + 6, clientY: point.y + 6,
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 17, pointerType: 'touch',
        isPrimary: true, clientX: point.x + 6, clientY: point.y + 6,
      }));
    }, start);
    expect(await page.locator('#square-cover-polygon').getAttribute('points')).not.toBe(original);
    expect(browserErrors).toEqual([]);
  });

  it('blocks a cover upload when the selected image cannot be previewed', async () => {
    await renderEditPage();
    await page.evaluate("document.querySelector('form[action$=\\\"/photos\\\"]').addEventListener('submit', event => event.preventDefault(), true)");
    await page.locator('[data-open-photo-upload][data-photo-role="back_cover"]').click({ timeout: 5000 });
    await page.locator('#altText').fill('Back cover photo');
    await page.locator('#photoFile').setInputFiles({
      name: 'broken-back-cover.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('not a decodable image'),
    });

    await page.waitForFunction(
      "document.querySelector('#selected-photo-info').textContent.includes('could not be previewed')",
      undefined,
      { timeout: 5000 }
    );
    await page.locator('form[action$="/photos"] button[type="submit"]').click({ timeout: 5000 });
    expect(await page.locator('#square-cover-status').textContent()).toContain(
      'This photo cannot be previewed'
    );
    expect(
      await page.locator('form[action$="/photos"]').getAttribute('data-photo-editor-ready')
    ).toBeNull();
  });

  it('warns when a previously saved back-cover photo is still portrait', async () => {
    await renderEditPage({
      id: '22222222-2222-4222-8222-222222222222',
      role: 'back_cover',
      publicUrl: 'data:image/jpeg;base64,' + portraitImage.toString('base64'),
      altText: 'Portrait back-cover photo',
    });

    await page.locator('.listing-photo-square-warning').waitFor({ state: 'visible', timeout: 5000 });
    expect(await page.locator('.listing-photo-square-warning').textContent()).toContain(
      'Upload a corrected replacement'
    );
  });
});
