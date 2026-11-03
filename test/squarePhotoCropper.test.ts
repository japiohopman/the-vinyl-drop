import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import path from 'path';
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
  let browser: Browser;
  let page: Page;
  let portraitImage: Buffer;

  beforeAll(async () => {
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
    page.on('pageerror', (error) => console.error('[cropper browser error]', error.message));
    await page.setViewportSize({ width: 375, height: 850 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  async function renderEditPage(existingPhoto?: {
    id: string;
    role: string;
    publicUrl: string;
    altText: string;
  }): Promise<void> {
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
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<style>' + stylesheet + '</style></head>' +
      '<body><main class="main-content">' + body + '</main></body></html>',
      { waitUntil: 'domcontentloaded', timeout: 5000 }
    );
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
      await page.keyboard.press('ArrowRight');
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

      await page.locator('.square-cover-adjustments > summary').click();
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

    await page.locator('[data-close-photo-upload]').first().click();
    await page.waitForTimeout(500);

    expect(await page.locator('#photoUploadDialog').isVisible()).toBe(false);
    expect(await page.locator('#photoFile').evaluate((input) => (input as HTMLInputElement).files?.length || 0)).toBe(0);
    expect(await page.locator('form[action$="/photos"]').getAttribute('data-photo-editor-ready')).toBeNull();
    expect(await page.locator('form[action$="/photos"] button[type="submit"]').isEnabled()).toBe(true);
  });

  it('shows a normal preview without cropping condition/detail photos', async () => {
    await renderEditPage();
    await selectPortrait('detail');
    expect(await page.locator('.photo-role-field').isVisible()).toBe(true);
    expect(await page.locator('#photo-role-guidance').isVisible()).toBe(true);
    expect(await page.locator('#altText').getAttribute('placeholder')).toBe('Describe what is visible, e.g. a crease or Side A label');
    expect(await page.locator('#altText').getAttribute('required')).not.toBeNull();

    await page.waitForFunction(
      "document.querySelector('#photo-original-preview').naturalWidth === 300",
      undefined,
      { timeout: 5000 }
    );
    expect(await page.locator('#square-cover-cropper').isVisible()).toBe(false);
    expect(await page.locator('#photo-original-preview').isVisible()).toBe(true);
    expect(await page.locator('#selected-photo-info').textContent()).toContain('300 × 500 px');
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
