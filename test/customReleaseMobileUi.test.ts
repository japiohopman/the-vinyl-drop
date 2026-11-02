import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';
import { LISTING_PHOTO_ROLE_GUIDANCE, LISTING_PHOTO_ROLE_LABELS, LISTING_PHOTO_ROLES, NEW_LISTING_PHOTO_ROLES } from '../src/domain/listingPhotoRole';

// The project test tsconfig omits DOM libs; these globals are only referenced
// inside functions serialized and executed by Playwright in a browser page.
interface PlaywrightTestStatusElement {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  textContent: string | null;
}
interface PlaywrightTestDocument {
  documentElement: { scrollWidth: number };
  body: { scrollWidth: number };
  getElementById(id: string): PlaywrightTestStatusElement | null;
  querySelector(selector: string): PlaywrightTestStatusElement | null;
}
declare const window: { innerWidth: number };
declare const document: PlaywrightTestDocument;
declare const getComputedStyle: (element: object) => { gridTemplateColumns: string };

describe('Custom release mobile navigation and artwork picker', () => {
  jest.setTimeout(30000);

  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const releasePath = path.join(__dirname, '../views/releases/new.ejs');
  const editListingPath = path.join(__dirname, '../views/listings/edit.ejs');
  const createListingPath = path.join(__dirname, '../views/listings/create.ejs');
  const stylesheetContent = readFullStylesheetSource();
  const pickerScript = fs.readFileSync(path.join(__dirname, '../public/js/release-file-picker.js'), 'utf8');
  const discogsLookupScript = fs.readFileSync(path.join(__dirname, '../public/js/discogs-release-lookup.js'), 'utf8');

  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  async function renderHeader(currentPath: string): Promise<string> {
    return ejs.renderFile(headerPath, {
      getIconSvg,
      currentPath,
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    }, { filename: headerPath }) as unknown as Promise<string>;
  }

  async function renderReleasePage(): Promise<string> {
    return ejs.renderFile(releasePath, {
      getIconSvg,
      form: {
        values: { format: 'LP' },
        fieldErrors: {},
        generalErrors: [],
      },
    }, { filename: releasePath }) as unknown as Promise<string>;
  }

  async function renderCreateListingPage(): Promise<string> {
    return ejs.renderFile(createListingPath, {
      getIconSvg,
      release: {
        id: 'release-mobile-test',
        title: 'Kind of Blue',
        artist: 'Miles Davis',
        label: 'Columbia',
        releaseYear: 1959,
      },
      form: {
        values: {
          releaseId: 'release-mobile-test',
          mediaCondition: 'NM',
          sleeveCondition: 'NM',
          priceEur: '',
          tradeAvailable: 'false',
          description: '',
          notes: '',
        },
        fieldErrors: {},
        generalErrors: [],
      },
    }, { filename: createListingPath }) as unknown as Promise<string>;
  }

  async function renderEditListingPage(): Promise<string> {
    return ejs.renderFile(editListingPath, {
      getIconSvg,
      listing: {
        id: 'listing-artwork-ui-test',
        status: 'draft',
        price: 2500,
        tradeAvailable: false,
        description: '',
      },
      release: {
        id: 'release-artwork-ui-test',
        title: 'Doggystyle',
        artist: 'Snoop Dogg',
        releaseYear: 1993,
        coverArtUrl: 'https://i.discogs.com/doggystyle.jpg',
        externalSource: 'discogs',
        externalId: '123456',
        youtubeVideoId: null,
      },
      physicalCopy: { mediaCondition: 'VG+', sleeveCondition: 'VG', notes: null },
      photos: [],
      form: { values: {}, fieldErrors: {}, generalErrors: [] },
      photoRoles: LISTING_PHOTO_ROLES,
      newPhotoRoles: NEW_LISTING_PHOTO_ROLES,
      photoRoleLabels: LISTING_PHOTO_ROLE_LABELS,
      photoRoleGuidance: LISTING_PHOTO_ROLE_GUIDANCE,
      photoError: '',
      releaseArtworkError: false,
      youtubePreviewError: false,
    }, { filename: editListingPath }) as unknown as Promise<string>;
  }

  function documentHtml(headerHtml: string, releaseHtml: string): string {
    const content = releaseHtml
      .replace('<script src="/js/release-file-picker.js" defer></script>', '')
      .replace('<script src="/js/square-photo-cropper.js" defer></script>', '')
      .replace('<script src="/js/discogs-release-lookup.js" defer></script>', '');
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <base href="http://localhost/">
        <style>${stylesheetContent}</style>
      </head>
      <body>
        ${headerHtml}
        <main class="main-content container">${content}</main>
      </body>
      </html>`;
  }

  it('shows the current section in the mobile header and moves the custom-release back link into it', async () => {
    const digHeader = await renderHeader('/dig');
    expect(digHeader).toContain('<span class="mobile-context-heading">DIG</span>');
    expect(digHeader).not.toContain('mobile-dig-back');
    expect(digHeader).not.toContain('aria-label="Back to browse results"');

    const releaseHeader = await renderHeader('/releases/new');
    expect(releaseHeader).toContain('<span class="mobile-context-heading">DROP</span>');
    expect(releaseHeader).toContain('href="/drop/new"');
    expect(releaseHeader).toContain('class="mobile-context-back mobile-context-back-icon-only"');
    expect(releaseHeader).toContain('aria-label="Back to catalog search"');
    expect(releaseHeader).not.toContain('Back to catalog</span>');
    expect(releaseHeader).toContain('The Vinyl Drop Home');

    const dropStart = releaseHeader.indexOf('class="mobile-nav-item mobile-nav-drop');
    const dropLink = releaseHeader.slice(dropStart, releaseHeader.indexOf('</a>', dropStart) + 4);
    expect(dropLink).toContain('class="icon icon-plain-arrow"');
    expect(dropLink).not.toContain('icon-photo-camera');
    expect(dropLink).toContain('+ DROP');
  });

  it('places the listing editor back action inside the global mobile navigation', async () => {
    const listingHeader = await renderHeader('/listings/11111111-1111-4111-8111-111111111111/edit');
    expect(listingHeader).toContain('<span class="mobile-context-heading">DROP</span>');
    expect(listingHeader).toContain('href="/listings" class="mobile-context-back mobile-context-back-icon-only" aria-label="Back to My Listings"');
    expect(listingHeader).toContain('<span class="mobile-context-back-icon" aria-hidden="true">←</span>');
  });

  it('routes listing creation back to + DROP and stacks compact icon actions on mobile', async () => {
    const headerHtml = await renderHeader('/listings/create');
    const createHtml = await renderCreateListingPage();

    expect(headerHtml).toContain('<span class="mobile-context-heading">DROP</span>');
    expect(headerHtml).toContain('href="/drop/new" class="mobile-context-back mobile-context-back-icon-only" aria-label="Back to release search"');
    expect(headerHtml).not.toContain('aria-label="Back to My Listings"');
    expect(createHtml).toContain('href="/drop/new" class="create-listing-back-desktop"');
    expect(createHtml).not.toContain('href="/listings/new"');
    expect(createHtml).toContain('name="releaseId" value="release-mobile-test"');
    expect(createHtml).toContain('class="icon icon-save"');
    expect(createHtml).toContain('class="icon icon-close"');
    expect(createHtml).toContain('class="btn btn-primary btn-md create-listing-submit"');
    // Link buttons include a trailing separator before their optional disabled class.
    expect(createHtml).toContain('create-listing-cancel');

    for (const width of [320, 360, 375, 414]) {
      await page.setViewportSize({ width, height: 780 });
      await page.setContent(documentHtml(headerHtml, createHtml));

      const cardCorners = await page.evaluate(
        "({ card: getComputedStyle(document.querySelector('.create-listing-card')).borderRadius, release: getComputedStyle(document.querySelector('.create-listing-release')).borderRadius })"
      ) as { card: string; release: string };
      expect(cardCorners.card).toBe('0px');
      expect(cardCorners.release).toBe('0px');

      const mobileBack = page.locator('.mobile-context-back');
      expect(await mobileBack.getAttribute('href')).toBe('/drop/new');
      expect(await mobileBack.isVisible()).toBe(true);
      expect(await page.locator('.create-listing-back-desktop').isVisible()).toBe(false);
      expect(await page.locator('.create-listing-actions .btn').count()).toBe(2);
      expect(await page.locator('.create-listing-actions .create-listing-submit').getAttribute('type')).toBe('submit');
      expect(await page.locator('.create-listing-actions .create-listing-cancel').getAttribute('href')).toBe('/drop/new');
      expect(await page.evaluate("window.getComputedStyle(document.querySelector('.create-listing-actions')).flexDirection")).toBe('column');

      const buttons = await page.evaluate(
        "Array.from(document.querySelectorAll('.create-listing-actions .btn')).map((element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, right: rect.right, width: rect.width, height: rect.height }; })"
      ) as Array<{ x: number; right: number; width: number; height: number }>;
      expect(buttons).toHaveLength(2);
      for (const box of buttons) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width + 1);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      const dimensions = await page.evaluate("({document: document.documentElement.scrollWidth, body: document.body.scrollWidth})") as { document: number; body: number };
      expect(dimensions.document).toBeLessThanOrEqual(width + 1);
      expect(dimensions.body).toBeLessThanOrEqual(width + 1);
    }

    await page.setViewportSize({ width: 1024, height: 780 });
    await page.setContent(documentHtml(headerHtml, createHtml));
    expect(await page.locator('.create-listing-back-desktop').isVisible()).toBe(true);
    expect(await page.locator('.create-listing-back-desktop').getAttribute('href')).toBe('/drop/new');
    expect(await page.evaluate("window.getComputedStyle(document.querySelector('.create-listing-actions')).flexDirection")).toBe('row');
  });

  it('fits About context labels and icon-only back targets on narrow mobile widths', async () => {
    const pages = [
      ['/terms', 'ABOUT · TERMS', '/', 'Back to Home'],
      ['/contact', 'ABOUT · CONTACT', '/', 'Back to Home'],
      ['/privacy', 'ABOUT · PRIVACY', '/', 'Back to Home'],
      ['/community-rules', 'ABOUT · COMMUNITY RULES', '/', 'Back to Home'],
      ['/releases/new', 'DROP', '/drop/new', 'Back to catalog search'],
    ] as const;

    for (const [route, label, destination, accessibleName] of pages) {
      const headerHtml = await renderHeader(route);
      for (const width of [320, 360, 375, 414]) {
        await page.setViewportSize({ width, height: 740 });
        await page.setContent(`<!doctype html>
          <html lang="en"><head><meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${stylesheetContent}</style></head>
          <body>${headerHtml}</body></html>`);

        expect(await page.locator('.mobile-context-heading').textContent()).toBe(label);
        const back = page.locator('.mobile-context-back-icon-only');
        expect(await back.isVisible()).toBe(true);
        expect(await back.getAttribute('href')).toBe(destination);
        expect(await back.getAttribute('aria-label')).toBe(accessibleName);
        expect((await back.locator('.mobile-context-back-icon').textContent())?.trim()).toBe('←');

        const box = await back.boundingBox();
        const headingBox = await page.locator('.mobile-context-heading').boundingBox();
        expect(box).not.toBeNull();
        expect(headingBox).not.toBeNull();
        if (box && headingBox) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(box.x);
        }
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        expect(dimensions.viewport).toBe(width);
        expect(dimensions.document).toBeLessThanOrEqual(width + 1);
        expect(dimensions.body).toBeLessThanOrEqual(width + 1);
      }
    }
  });

  it('keeps a visible Discogs artwork stage without asking for a catalogue upload on the first DROP page', async () => {
    const headerHtml = await renderHeader('/drop/new');
    const releaseHtml = await renderReleasePage();
    expect(releaseHtml).not.toContain('name="coverArt"');
    expect(releaseHtml).not.toContain('Catalogue artwork replacement');
    expect(releaseHtml).toContain('name="coverArtUrl"');

    for (const width of [360, 375, 430, 1024, 1280]) {
      await page.setViewportSize({ width, height: 820 });
      await page.setContent(documentHtml(headerHtml, releaseHtml));
      expect(await page.locator('[data-discogs-cover-preview]').isVisible()).toBe(true);
      expect(await page.locator('[data-discogs-artwork-placeholder]').isVisible()).toBe(true);
      expect(await page.locator('[data-discogs-cover-preview-status]').textContent()).toContain('confident Discogs match');
      const artworkFrame = await page.locator('[data-discogs-cover-frame]').boundingBox();
      expect(artworkFrame).not.toBeNull();
      if (artworkFrame) {
        expect(artworkFrame.width).toBeGreaterThanOrEqual(width >= 768 ? 224 : 120);
        expect(Math.abs(artworkFrame.width - artworkFrame.height)).toBeLessThanOrEqual(1);
      }
      const primaryColumnCount = await page.evaluate(() => {
        const grid = document.querySelector('.custom-release-primary-fields');
        return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      });
      expect(primaryColumnCount).toBe(width >= 768 ? 2 : 1);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(dimensions.viewport).toBe(width);
      expect(dimensions.document).toBeLessThanOrEqual(width + 1);
      expect(dimensions.body).toBeLessThanOrEqual(width + 1);
    }
  });

  it('keeps release artwork and actual-copy photos distinct in the responsive listing editor', async () => {
    const headerHtml = await renderHeader('/listings/listing-artwork-ui-test/edit');
    const editHtml = await renderEditListingPage();
    await page.route('https://i.discogs.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#fff"/></svg>',
      });
    });
    expect(editHtml).toContain('class="release-artwork-editor"');
    expect(editHtml).toContain('shared by listings of this same release');
    expect(editHtml).toContain('Use original Discogs artwork');
    expect(editHtml).toContain('/release-artwork/restore-discogs');
    expect(editHtml).toContain('name="coverArt"');
    expect(editHtml).toContain('Front of your copy');
    expect(editHtml).toContain('Back of your copy');
    expect(editHtml).not.toContain('Catalogue artwork replacement');

    for (const width of [360, 430, 1024, 1280]) {
      await page.setViewportSize({ width, height: 820 });
      await page.setContent(documentHtml(headerHtml, editHtml));
      expect(await page.locator('.release-artwork-editor').isVisible()).toBe(true);
      const releaseArtworkFrame = await page.locator('.release-artwork-preview-frame').boundingBox();
      expect(releaseArtworkFrame).not.toBeNull();
      if (releaseArtworkFrame) {
        expect(releaseArtworkFrame.width).toBeGreaterThanOrEqual(width >= 768 ? 192 : 104);
        expect(Math.abs(releaseArtworkFrame.width - releaseArtworkFrame.height)).toBeLessThanOrEqual(1);
      }
      expect(await page.locator('.release-artwork-preview-frame img').getAttribute('src')).toBe('https://i.discogs.com/doggystyle.jpg');
      expect(await page.locator('.cover-photo-slots').isVisible()).toBe(true);
      expect(await page.locator('.release-artwork-restore-form button').isVisible()).toBe(true);
      expect(await page.locator('.custom-release-file-trigger').isVisible()).toBe(true);
      expect(await page.locator('#releaseCoverArt').getAttribute('class')).toContain('custom-release-file-input');
      if (width < 768) {
        expect(await page.locator('.release-artwork-file-mobile-label').isVisible()).toBe(true);
        expect(await page.locator('.release-artwork-file-desktop-label').isVisible()).toBe(false);
      } else {
        expect(await page.locator('.release-artwork-file-mobile-label').isVisible()).toBe(false);
        expect(await page.locator('.release-artwork-file-desktop-label').isVisible()).toBe(true);
      }
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(dimensions.viewport).toBe(width);
      expect(dimensions.document).toBeLessThanOrEqual(width + 1);
      expect(dimensions.body).toBeLessThanOrEqual(width + 1);
    }

    await page.addScriptTag({ content: pickerScript });
    await page.locator('#releaseCoverArt').setInputFiles({
      name: 'replacement-cover.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('fake image bytes'),
    });
    expect(await page.locator('#releaseCoverArtFilename').textContent()).toBe('replacement-cover.webp');
    await page.waitForFunction(
      () => !document.querySelector('[data-release-cover-override-preview]')?.hasAttribute('hidden'),
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('[data-release-cover-override-image]').getAttribute('src')).toMatch(/^data:image\/webp;base64,/);
    await page.locator('[data-clear-release-cover-override]').click();
    expect(await page.locator('#releaseCoverArt').inputValue()).toBe('');
    expect(await page.locator('[data-release-cover-override-preview]').isHidden()).toBe(true);
  });

  it('fills editable release metadata after a debounced confident Discogs match', async () => {
    const headerHtml = await renderHeader('/drop/new');
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(documentHtml(headerHtml, releaseHtml));
    let lookupRequests = 0;
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      lookupRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: true,
          metadata: {
            label: 'Polydor',
            catalogueNumber: 'PD 123',
            releaseYear: '1970',
            format: 'Vinyl, LP, Album',
            barcode: '0123456789012',
            country: 'UK',
            genre: 'Funk, Soul',
            coverArtUrl: 'https://i.discogs.com/example-cover.jpg',
            discogsExternalId: '123'
          }
        })
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });

    await page.locator('#releaseArtist').fill('James Brown');
    await page.locator('#releaseTitle').fill('Sex Machine');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'found',
      undefined,
      { timeout: 3000 }
    );

    expect(lookupRequests).toBe(1);
    expect(await page.locator('#releaseArtist').inputValue()).toBe('James Brown');
    expect(await page.locator('#releaseTitle').inputValue()).toBe('Sex Machine');
    expect(await page.locator('[name="label"]').inputValue()).toBe('Polydor');
    expect(await page.locator('[name="catalogueNumber"]').inputValue()).toBe('PD 123');
    expect(await page.locator('[name="releaseYear"]').inputValue()).toBe('1970');
    expect(await page.locator('[name="format"]').inputValue()).toBe('Vinyl, LP, Album');
    expect(await page.locator('[name="barcode"]').inputValue()).toBe('0123456789012');
    expect(await page.locator('[name="country"]').inputValue()).toBe('UK');
    expect(await page.locator('[name="genre"]').inputValue()).toBe('Funk, Soul');
    expect(await page.locator('#discogsCoverArtUrl').inputValue()).toBe('https://i.discogs.com/example-cover.jpg');
    expect(await page.locator('#discogsExternalId').inputValue()).toBe('123');
    expect(await page.locator('#discogsLookupStatus').getAttribute('role')).toBe('status');
    expect(await page.locator('#releaseMetadataDetails').getAttribute('open')).not.toBeNull();
    expect(await page.locator('[data-discogs-cover-preview]').isVisible()).toBe(true);
    expect(await page.locator('#releaseMetadataDetails [data-discogs-cover-preview]').count()).toBe(0);
    expect(await page.locator('[data-discogs-cover-preview] img').getAttribute('src')).toBe('https://i.discogs.com/example-cover.jpg');

    await page.setViewportSize({ width: 1280, height: 820 });
    const desktopArtworkFrame = await page.locator('[data-discogs-cover-frame]').boundingBox();
    expect(desktopArtworkFrame).not.toBeNull();
    if (desktopArtworkFrame) expect(desktopArtworkFrame.width).toBeGreaterThanOrEqual(224);
    expect(await page.locator('[data-discogs-cover-preview] img').isVisible()).toBe(true);
    const desktopPrimaryColumnCount = await page.evaluate(() => {
      const grid = document.querySelector('.custom-release-primary-fields');
      return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
    });
    expect(desktopPrimaryColumnCount).toBe(2);

    const dimensions = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(376);
    expect(dimensions.body).toBeLessThanOrEqual(376);
  });

  it('shows an explicit state when a confident Discogs match has no artwork URL', async () => {
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(documentHtml(await renderHeader('/drop/new'), releaseHtml));
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: true,
          matchType: 'release',
          metadata: { label: 'No Image Records' },
        }),
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });
    await page.locator('#releaseArtist').fill('Local Artist');
    await page.locator('#releaseTitle').fill('White Label');
    await page.waitForFunction(
      () => document.querySelector('[data-discogs-cover-preview-status]')?.textContent?.includes('no catalogue artwork is available') === true,
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('[data-discogs-cover-preview]').isVisible()).toBe(true);
    expect(await page.locator('[data-discogs-cover-preview] img').isHidden()).toBe(true);
    expect(await page.locator('[data-discogs-artwork-placeholder]').isVisible()).toBe(true);
    expect(await page.locator('[data-discogs-cover-preview-status]').textContent()).toContain('add release artwork later in Edit listing');
    expect(await page.locator('#releaseCoverArt').count()).toBe(0);
  });

  it('explains when Discogs artwork cannot load and directs sellers to the listing editor', async () => {
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(documentHtml(await renderHeader('/drop/new'), releaseHtml));
    await page.route('https://i.discogs.com/**', async (route) => {
      await route.fulfill({ status: 404, body: 'missing image' });
    });
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: true,
          matchType: 'release',
          metadata: { coverArtUrl: 'https://i.discogs.com/missing-cover.jpg' },
        }),
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });
    await page.locator('#releaseArtist').fill('Snoop Dogg');
    await page.locator('#releaseTitle').fill('Doggystyle');
    await page.waitForFunction(
      () => document.querySelector('[data-discogs-cover-preview-status]')?.textContent?.includes('could not be loaded') === true,
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('[data-discogs-cover-preview] img').isHidden()).toBe(true);
    expect(await page.locator('[data-discogs-artwork-placeholder]').isVisible()).toBe(true);
    expect(await page.locator('[data-discogs-cover-preview-status]').textContent()).toContain('replacement in Edit listing');
    expect(await page.locator('#releaseCoverArt').count()).toBe(0);
  });

  it('waits for a pending Discogs lookup before allowing DROP form submission', async () => {
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(documentHtml(await renderHeader('/drop/new'), releaseHtml));

    let allowLookupResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => { allowLookupResponse = resolve; });
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      await responseGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: true,
          matchType: 'release',
          metadata: { coverArtUrl: 'https://i.discogs.com/doggystyle.jpg' },
        }),
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });
    await page.locator('#releaseArtist').fill('Snoop Dogg');
    await page.locator('#releaseTitle').fill('Doggystyle');
    await page.waitForRequest((request) => request.url().includes('/releases/lookup-metadata?'));
    await page.waitForFunction(
      () => document.querySelector('form[data-discogs-lookup-form]')?.getAttribute('data-lookup-pending') === 'true',
      undefined,
      { timeout: 3000 }
    );
    await page.addScriptTag({
      content: `
        (() => {
          const form = document.querySelector('form[data-discogs-lookup-form]');
          if (!form) throw new Error('DROP form not found');
          const invalidFields = Array.from(form.querySelectorAll(':invalid'))
            .map((field) => field.id || field.name || field.tagName);
          if (invalidFields.length > 0) {
            form.setAttribute('data-test-invalid-fields', invalidFields.join(','));
          }
          // This test is about the asynchronous Discogs submit lifecycle.
          // Assert native validity after the required values have been filled,
          // then isolate the submit event from browser validation.
          form.noValidate = true;
          document.addEventListener('submit', (event) => {
            if (event.target !== form) return;
            event.preventDefault();
            form.setAttribute(
              'data-test-submit-count',
              String(Number(form.getAttribute('data-test-submit-count') || '0') + 1)
            );
          }, true);
        })();
      `,
    });
    expect(await page.locator('.custom-release-submit').isEnabled()).toBe(true);
    expect(await page.locator('form[data-discogs-lookup-form]').getAttribute('data-test-invalid-fields')).toBeNull();

    await page.locator('.custom-release-submit').click();
    expect(await page.locator('form[data-discogs-lookup-form]').getAttribute('data-test-submit-count')).toBe('1');

    allowLookupResponse();

    await page.waitForFunction(
      () => document.querySelector('form[data-discogs-lookup-form]')?.getAttribute('data-test-submit-count') === '2',
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('.custom-release-submit').isEnabled()).toBe(true);
    expect(await page.locator('#discogsCoverArtUrl').inputValue()).toBe('https://i.discogs.com/doggystyle.jpg');
  });

  it('preserves manually corrected metadata when a later lookup runs', async () => {
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(documentHtml(await renderHeader('/drop/new'), releaseHtml));

    let lookupRequests = 0;
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      lookupRequests += 1;
      const metadata = lookupRequests === 1
        ? {
            label: 'Polydor',
            catalogueNumber: 'PD 123',
            releaseYear: '1970',
            format: 'Vinyl, LP, Album',
            barcode: '0123456789012',
            country: 'UK',
            genre: 'Funk, Soul',
            coverArtUrl: 'https://i.discogs.com/first-cover.jpg',
          }
        : {
            label: 'Replacement Label',
            catalogueNumber: 'PD 456',
            releaseYear: '1971',
            format: 'Vinyl, LP, Album',
            barcode: '9988776655443',
            country: 'US',
            genre: 'Funk',
            coverArtUrl: 'https://i.discogs.com/second-cover.jpg',
          };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ found: true, matchType: 'release', metadata }),
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });

    await page.locator('#releaseArtist').fill('James Brown');
    await page.locator('#releaseTitle').fill('Sex Machine');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'found',
      undefined,
      { timeout: 3000 }
    );
    expect(lookupRequests).toBe(1);
    expect(await page.locator('#releaseMetadataDetails').getAttribute('open')).not.toBeNull();

    await page.locator('[name="label"]').fill('My corrected label');
    await page.locator('#releaseTitle').fill('Sex Machine edit');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'found',
      undefined,
      { timeout: 3000 }
    );

    expect(lookupRequests).toBe(2);
    expect(await page.locator('[name="label"]').inputValue()).toBe('My corrected label');
    expect(await page.locator('[name="catalogueNumber"]').inputValue()).toBe('PD 456');
    expect(await page.locator('[name="releaseYear"]').inputValue()).toBe('1971');
  });

  it('keeps manual entry available when lookup returns no match or a temporary error', async () => {
    const releaseHtml = await renderReleasePage();
    await page.setViewportSize({ width: 320, height: 760 });
    await page.setContent(documentHtml(await renderHeader('/drop/new'), releaseHtml));
    let responseStatus = 200;
    let responseBody: Record<string, unknown> = { found: false };
    await page.route('http://localhost/releases/lookup-metadata**', async (route) => {
      await route.fulfill({
        status: responseStatus,
        contentType: 'application/json',
        body: JSON.stringify(responseBody)
      });
    });
    await page.addScriptTag({ content: discogsLookupScript });
    await page.locator('#releaseArtist').fill('Local artist');
    await page.locator('#releaseTitle').fill('Unindexed white label');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'empty',
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('#releaseArtist').inputValue()).toBe('Local artist');
    expect(await page.locator('#releaseMetadataDetails').getAttribute('open')).not.toBeNull();

    responseStatus = 503;
    responseBody = { error: 'Unavailable' };
    await page.locator('#releaseArtist').fill('Another artist');
    await page.locator('#releaseTitle').fill('Another title');
    await page.waitForFunction(
      () => document.getElementById('discogsLookupStatus')?.getAttribute('data-state') === 'error',
      undefined,
      { timeout: 3000 }
    );
    expect(await page.locator('#releaseArtist').inputValue()).toBe('Another artist');
    expect(await page.locator('#releaseTitle').inputValue()).toBe('Another title');
    expect(await page.locator('#releaseMetadataDetails').isVisible()).toBe(true);
    expect(await page.locator('#releaseMetadataDetails').getAttribute('open')).not.toBeNull();
    const dimensions = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(321);
    expect(dimensions.body).toBeLessThanOrEqual(321);
  });

  it('prevents horizontal overflow and stacks metadata fields at narrow viewport sizes', async () => {
    const headerHtml = await renderHeader('/releases/new');
    const releaseHtml = await renderReleasePage();
    const html = documentHtml(headerHtml, releaseHtml);

    for (const width of [320, 360, 375, 414]) {
      await page.setViewportSize({ width, height: 820 });
      await page.setContent(html);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        columns: getComputedStyle(document.querySelector('.custom-release-grid') as object).gridTemplateColumns,
      }));
      expect(dimensions.document).toBeLessThanOrEqual(width + 1);
      expect(dimensions.body).toBeLessThanOrEqual(width + 1);
      expect(dimensions.columns.split(' ').length).toBe(1);
    }
  });
});
