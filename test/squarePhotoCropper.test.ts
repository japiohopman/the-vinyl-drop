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
      '<body><main class="main-content">' + body + '</main></body></html>'
    );
    await page.addScriptTag({ path: cropperPath });
  }

  async function selectPortrait(role: string): Promise<void> {
    await page.locator('#newPhotoRole').selectOption(role);
    await page.locator('#altText').fill('Full physical sleeve cover');
    await page.locator('#photoFile').setInputFiles({
      name: role + '-phone-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: portraitImage,
    });
  }

  it('crops both front and back cover uploads to the exact square preview', async () => {
    await renderEditPage();

    await page.evaluate("(() => {" +
      "const form = document.querySelector('form[action$=\"/photos\"]');" +
      "window.__capturedUploads = [];" +
      "form.addEventListener('submit', (event) => {" +
        "if (form.dataset.squareCropReady !== 'true') return;" +
        "event.preventDefault();" +
        "const file = new FormData(form).get('photo');" +
        "if (!(file instanceof File)) return;" +
        "createImageBitmap(file).then((bitmap) => {" +
          "window.__capturedUploads.push({ name: file.name, type: file.type, width: bitmap.width, height: bitmap.height });" +
          "bitmap.close();" +
        "});" +
      "}, true);" +
    "})()");

    const roles = ['front_cover', 'back_cover'];
    for (let index = 0; index < roles.length; index += 1) {
      const role = roles[index];
      await selectPortrait(role);
      await page.waitForFunction(
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
          "return {" +
            "viewport: window.innerWidth," +
            "section: root.getBoundingClientRect().width," +
            "sectionScroll: root.scrollWidth," +
            "cropper: cropper.getBoundingClientRect().width," +
            "cropperScroll: cropper.scrollWidth" +
          "};" +
        "})()") as {
          viewport: number;
          section: number;
          sectionScroll: number;
          cropper: number;
          cropperScroll: number;
        };
        expect(layout.sectionScroll).toBeLessThanOrEqual(layout.section + 1);
        expect(layout.cropperScroll).toBeLessThanOrEqual(layout.cropper + 1);
      }

      await page.locator('form[action$="/photos"] button[type="submit"]').click({ timeout: 5000 });
      await page.waitForFunction(
        'window.__capturedUploads.length === ' + (index + 1),
        undefined,
        { timeout: 5000 }
      );
      const uploaded = await page.evaluate('window.__capturedUploads[' + index + ']') as {
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

    await page.waitForFunction("document.querySelector('#photo-original-preview').naturalWidth === 300");
    expect(await page.locator('#square-cover-cropper').isVisible()).toBe(false);
    expect(await page.locator('#photo-original-preview').isVisible()).toBe(true);
    expect(await page.locator('#selected-photo-info').textContent()).toContain('300 × 500 px');
  });

  it('warns when a previously saved back-cover photo is still portrait', async () => {
    await renderEditPage({
      id: '22222222-2222-4222-8222-222222222222',
      role: 'back_cover',
      publicUrl: 'data:image/jpeg;base64,' + portraitImage.toString('base64'),
      altText: 'Portrait back-cover photo',
    });

    await page.locator('.listing-photo-square-warning').waitFor({ state: 'visible' });
    expect(await page.locator('.listing-photo-square-warning').textContent()).toContain(
      'Delete it and upload it again'
    );
  });
});
