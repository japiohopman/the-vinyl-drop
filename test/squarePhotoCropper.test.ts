import ejs from 'ejs';
import fs from 'fs';
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
  const stylesheet = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
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

    const body = html.replace(
      /<script src="\/js\/square-photo-cropper\.js" defer><\/script>/,
      ''
    );
    await page.setContent(
      '<!doctype html><html lang="en"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<style>' + stylesheet + '</style></head>' +
      '<body><main class="main-content">' + body + '</main></body></html>',
      { waitUntil: 'domcontentloaded', timeout: 5000 }
    );
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
    await page.locator(slot).click({ timeout: 5000 });
    await page.locator('#newPhotoRole').selectOption(role, { timeout: 5000 });
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
    expect(await page.locator('#photoUploadTitle').textContent()).toBe('Upload front cover');

    await page.locator('[data-close-photo-upload]').first().click({ timeout: 5000 });
    await page.locator('[data-open-photo-upload][data-photo-role="back_cover"]').click({ timeout: 5000 });
    expect(await page.locator('#newPhotoRole').inputValue()).toBe('back_cover');
    expect(await page.locator('#photoUploadTitle').textContent()).toBe('Upload back cover');
  });

  it('crops both front and back cover uploads to the exact square preview', async () => {
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
        role === 'front_cover' ? 'Square front cover crop' : 'Square back cover crop'
      );

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
        `document.querySelector('form[action$="/photos"]').dataset.squareCropReady === 'true'`,
        undefined,
        { timeout: 5000 }
      );
      const uploaded = await page.evaluate("(async () => {" +
        "const fileInput = document.querySelector('#photoFile');" +
        "const file = fileInput && fileInput.files && fileInput.files[0];" +
        "if (!file) throw new Error('The cropper did not replace the selected photo.');" +
        "const bitmap = await createImageBitmap(file);" +
        "const result = { name: file.name, type: file.type, width: bitmap.width, height: bitmap.height };" +
        "bitmap.close();" +
        "return result;" +
      "})()") as {
        name: string;
        type: string;
        width: number;
        height: number;
      };
      expect(uploaded.type).toBe('image/jpeg');
      expect(uploaded.width).toBe(1024);
      expect(uploaded.height).toBe(1024);
      expect(uploaded.name).toContain(role + '-square.jpg');
    }
  });

  it('shows a normal preview without cropping condition/detail photos', async () => {
    await renderEditPage();
    await selectPortrait('detail');

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
    await page.locator('#newPhotoRole').selectOption('back_cover');
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
      await page.locator('form[action$="/photos"]').getAttribute('data-square-crop-ready')
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
      'Delete it and upload it again'
    );
  });
});
