/// <reference lib="dom" />

import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser } from 'playwright';
import { AuthorizationError, NotFoundError, ValidationError } from '../src/app/services/errors';
import { normalizeYouTubeVideoId } from '../src/validators/youtubePreview';
import { updateReleaseYouTubePreviewForListing } from '../src/app/services/releaseService';

jest.mock('../src/db', () => ({ getDb: jest.fn() }));
jest.mock('../src/app/repositories/listingRepository');
jest.mock('../src/app/repositories/physicalCopyRepository');
jest.mock('../src/app/repositories/releaseRepository');

import * as listingRepository from '../src/app/repositories/listingRepository';
import * as physicalCopyRepository from '../src/app/repositories/physicalCopyRepository';
import * as releaseRepository from '../src/app/repositories/releaseRepository';

const listingId = 'listing-youtube-226';
const sellerId = 'seller-youtube-226';
const otherUserId = 'other-youtube-226';
const physicalCopyId = 'copy-youtube-226';
const releaseId = 'release-youtube-226';
const validId = 'dQw4w9WgXcQ';
const playlistContextUrl = 'https://www.youtube.com/watch?v=b4FxjBAjn_s&list=OLAK5uy_nBfwErsGbb7yzzdJhsBXX4qHHu2OHxzDs';

describe('YouTube release preview (#226)', () => {
  jest.setTimeout(30000);

  const partialPath = path.join(process.cwd(), 'views/partials/youtube-preview.ejs');
  const headerPath = path.join(process.cwd(), 'views/partials/header.ejs');
  const navPath = path.join(process.cwd(), 'views/partials/nav.ejs');
  const mainLayoutPath = path.join(process.cwd(), 'views/layouts/main.ejs');
  const partial = fs.readFileSync(partialPath, 'utf8');
  const headerTemplate = fs.readFileSync(headerPath, 'utf8');
  const navTemplate = fs.readFileSync(navPath, 'utf8');
  const mainLayoutTemplate = fs.readFileSync(mainLayoutPath, 'utf8');
  const stylesheet = readFullStylesheetSource();
  const playerScriptPath = path.join(process.cwd(), 'public/js/youtube-preview.js');
  const routeSource = fs.readFileSync(path.join(process.cwd(), 'src/app/routes/listingRoutes.ts'), 'utf8');
  const editTemplate = fs.readFileSync(path.join(process.cwd(), 'views/listings/edit.ejs'), 'utf8');
  const detailTemplate = fs.readFileSync(path.join(process.cwd(), 'views/listings/show.ejs'), 'utf8');
  const privacyTemplate = fs.readFileSync(path.join(process.cwd(), 'views/info/privacy.ejs'), 'utf8');

  beforeEach(() => {
    jest.clearAllMocks();
    (listingRepository.findListingById as jest.Mock).mockResolvedValue({
      id: listingId,
      sellerId,
      physicalCopyId,
    });
    (physicalCopyRepository.findPhysicalCopyById as jest.Mock).mockResolvedValue({
      id: physicalCopyId,
      releaseId,
      ownerId: sellerId,
    });
    (releaseRepository.findReleaseById as jest.Mock).mockResolvedValue({
      id: releaseId,
      artist: 'Sample Artist',
      title: 'Sample Release',
      youtubeVideoId: null,
    });
    (releaseRepository.updateReleaseYouTubeVideoId as jest.Mock).mockImplementation(
      async (id: string, youtubeVideoId: string | null) => ({
        id,
        artist: 'Sample Artist',
        title: 'Sample Release',
        youtubeVideoId,
      })
    );
  });

  describe('server-side URL normalization', () => {
    it('normalizes regular watch, short share, Shorts and live URLs to one video ID', () => {
      expect(normalizeYouTubeVideoId('https://www.youtube.com/watch?v=' + validId)).toBe(validId);
      expect(normalizeYouTubeVideoId(playlistContextUrl)).toBe('b4FxjBAjn_s');
      expect(normalizeYouTubeVideoId('https://www.youtube.com/watch?v=' + validId + '&list=PL123')).toBe(validId);
      expect(normalizeYouTubeVideoId('https://youtu.be/' + validId + '?si=share-token&list=PL123')).toBe(validId);
      expect(normalizeYouTubeVideoId('https://youtu.be/' + validId + '?si=share-token')).toBe(validId);
      expect(normalizeYouTubeVideoId('https://m.youtube.com/shorts/' + validId)).toBe(validId);
      expect(normalizeYouTubeVideoId('https://www.youtube.com/live/' + validId)).toBe(validId);
    });

    it('treats a blank string as removal and rejects missing or non-string input', () => {
      expect(normalizeYouTubeVideoId('')).toBeNull();
      expect(() => normalizeYouTubeVideoId(undefined)).toThrow();
      expect(() => normalizeYouTubeVideoId({ url: 'https://youtu.be/' + validId })).toThrow();
    });

    it.each([
      'https://evil.example/watch?v=' + validId,
      'http://youtu.be/' + validId,
      'https://youtube.com/embed/' + validId,
      'https://youtube.com/watch?v=bad',
      'https://www.youtube.com/playlist?list=PL123',
      'https://www.youtube.com/watch?list=PL123',
      '<iframe src="https://youtube.com/embed/' + validId + '"></iframe>',
      'https://youtu.be/' + validId + '/extra',
      'https://youtube.com/watch?v=' + validId + '&v=' + validId,
      'https://youtube-nocookie.com/embed/' + validId,
    ])('rejects unsafe or non-single-video input: %s', (value) => {
      expect(() => normalizeYouTubeVideoId(value)).toThrow();
    });
  });

  describe('release-level ownership and persistence', () => {
    it('updates the Release associated with the seller-owned listing physical copy', async () => {
      const updated = await updateReleaseYouTubePreviewForListing(
        listingId,
        sellerId,
        playlistContextUrl
      );
      expect(physicalCopyRepository.findPhysicalCopyById).toHaveBeenCalledWith(physicalCopyId, undefined);
      expect(releaseRepository.updateReleaseYouTubeVideoId).toHaveBeenCalledWith(releaseId, 'b4FxjBAjn_s', undefined);
      expect(updated.youtubeVideoId).toBe('b4FxjBAjn_s');
    });

    it('allows a seller to clear an optional preview', async () => {
      const updated = await updateReleaseYouTubePreviewForListing(listingId, sellerId, '');
      expect(releaseRepository.updateReleaseYouTubeVideoId).toHaveBeenCalledWith(releaseId, null, undefined);
      expect(updated.youtubeVideoId).toBeNull();
    });

    it('rejects non-owner attempts before touching release metadata', async () => {
      await expect(updateReleaseYouTubePreviewForListing(listingId, otherUserId, 'https://youtu.be/' + validId))
        .rejects.toBeInstanceOf(AuthorizationError);
      expect(releaseRepository.updateReleaseYouTubeVideoId).not.toHaveBeenCalled();
    });

    it('rejects bad input without changing the existing Release', async () => {
      await expect(updateReleaseYouTubePreviewForListing(listingId, sellerId, '<iframe src="evil"></iframe>'))
        .rejects.toBeInstanceOf(ValidationError);
      expect(releaseRepository.updateReleaseYouTubeVideoId).not.toHaveBeenCalled();
    });

    it('returns not found for unknown listings', async () => {
      (listingRepository.findListingById as jest.Mock).mockResolvedValueOnce(null);
      await expect(updateReleaseYouTubePreviewForListing(listingId, sellerId, 'https://youtu.be/' + validId))
        .rejects.toBeInstanceOf(NotFoundError);
      expect(releaseRepository.updateReleaseYouTubeVideoId).not.toHaveBeenCalled();
    });
  });

  it('renders a click-to-load preview only for a valid release video ID and omits it when missing/invalid', () => {
    const valid = ejs.render(partial, { release: { id: releaseId, title: 'Sample Release', youtubeVideoId: validId } });
    expect(valid).toContain('data-youtube-preview');
    expect(valid).toContain('data-youtube-preview-frame');
    expect(valid).toContain('data-youtube-preview-load');
    expect(valid).toContain('aria-label="Play YouTube preview for Sample Release"');
    expect(valid).toContain('Play preview');
    expect(valid).toContain('Pressing Play loads YouTube');
    expect(valid).toContain('Open this preview on YouTube');
    expect(valid).not.toContain('<iframe');
    expect(valid).not.toContain('youtube-nocookie.com/embed/');

    expect(ejs.render(partial, { release: { title: 'Sample Release', youtubeVideoId: null } }).trim()).toBe('');
    expect(ejs.render(partial, { release: { title: 'Sample Release', youtubeVideoId: '<iframe src=x>' } }).trim()).toBe('');
  });

  it('places the player after listing details and before comments, and provides shared-release editing and privacy disclosure', () => {
    const playerInclude = detailTemplate.indexOf("<%- include('../partials/youtube-preview', { release }) %>");
    const comments = detailTemplate.indexOf('<section class="listing-comments-entry"');
    expect(playerInclude).toBeGreaterThan(detailTemplate.indexOf('class="condition-section"'));
    expect(playerInclude).toBeLessThan(detailTemplate.indexOf('class="description-section"'));
    expect(comments).toBeGreaterThan(playerInclude);
    expect(routeSource).toContain("router.post('/:id/release-preview', requireAuth, validateSameOrigin, postUpdateReleaseYouTubePreview);");
    expect(editTemplate).toContain('YouTube preview for this release — shared by all listings of this release');
    expect(editTemplate).toContain('name="youtubePreviewUrl"');
    expect(privacyTemplate).toContain('youtube-nocookie.com');
    expect(privacyTemplate).toContain("loads only after the visitor presses the preview's Play button");
    expect(privacyTemplate).toContain('scrolling past the listing does not contact YouTube');
    expect(privacyTemplate).toContain('requests playback');
  });

  it('loads the privacy-enhanced player only after explicit Play, never on scroll, and only once', async () => {
    const browser: Browser = await chromium.launch({ headless: true });
    try {
      const start = stylesheet.indexOf('/* Issue #226 — optional release-level YouTube preview');
      const end = stylesheet.indexOf('/* Issue #220 — one shared comment thread', start);
      const polishStart = stylesheet.indexOf('/* Issue #255 — compact listing detail');
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      expect(polishStart).toBeGreaterThan(end);
      const playerCss = stylesheet.slice(start, end) + stylesheet.slice(polishStart);
      const renderedPartial = ejs.render(partial, {
        release: { id: releaseId, title: 'Sample Release', youtubeVideoId: validId },
      }).replace('<script src="/js/youtube-preview.js" defer></script>', '');

      for (const width of [320, 360, 390, 430, 768, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const externalRequests: string[] = [];
        page.on('request', (request) => {
          if (request.url().startsWith('https://www.youtube-nocookie.com/')) externalRequests.push(request.url());
        });
        await page.route('https://www.youtube-nocookie.com/**', (route) => route.abort());
        await page.setContent('<style>' + playerCss + '</style><div style="height: 1500px"></div>' + renderedPartial);
        await page.addScriptTag({ path: playerScriptPath });

        const loadButton = page.locator('[data-youtube-preview-load]');
        expect(await loadButton.isVisible()).toBe(true);
        expect(await page.locator('iframe').count()).toBe(0);
        expect(externalRequests).toHaveLength(0);
        expect(await page.locator('[data-youtube-preview-frame]').isHidden()).toBe(true);
        expect(await page.locator('[data-youtube-preview] .youtube-preview-fallback a').isVisible()).toBe(true);

        await page.evaluate(() => window.scrollTo(0, 900));
        await page.waitForTimeout(50);
        expect(await page.locator('iframe').count()).toBe(0);
        expect(externalRequests).toHaveLength(0);

        const youtubeRequest = page.waitForRequest((request) =>
          request.url().startsWith('https://www.youtube-nocookie.com/')
        );
        await loadButton.click();
        await youtubeRequest;

        const player = page.locator('iframe');
        await player.waitFor({ state: 'attached' });
        expect(await player.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/' + validId);
        expect(await player.getAttribute('src')).toContain('playsinline=1&autoplay=1');
        expect(await player.getAttribute('allow')).toContain('autoplay');
        const bounds = await player.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.width).toBeGreaterThanOrEqual(200);
        expect(bounds!.height).toBeGreaterThanOrEqual(200);
        expect(await loadButton.isHidden()).toBe(true);
        expect(await page.locator('[data-youtube-preview] .youtube-preview-fallback a').isVisible()).toBe(true);

        await loadButton.dispatchEvent('click');
        expect(await page.locator('iframe').count()).toBe(1);
        expect(externalRequests).toHaveLength(1);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });

  it('keeps the real listing-detail view compact and within the viewport across mobile and desktop widths', async () => {
    const detailPath = path.join(process.cwd(), 'views/listings/show.ejs');
    const renderedDetail = await ejs.renderFile(detailPath, {
      listing: {
        id: listingId,
        status: 'published',
        tradeAvailable: true,
        description: 'Sleeve has light wear. Record remains playable.',
      },
      release: {
        id: releaseId,
        title: 'Sample Release',
        artist: 'Sample Artist',
        coverArtUrl: null,
        youtubeVideoId: validId,
        format: '12-inch',
        releaseYear: 1997,
        label: 'Sample Label',
        catalogueNumber: 'SAMPLE-001',
        genre: 'Hip Hop',
      },
      photos: [],
      priceFormatted: '€12.00',
      physicalCopy: { mediaCondition: 'VG+', sleeveCondition: 'VG', notes: 'Light ring wear' },
      seller: { username: 'sample-seller', displayName: 'Sample Seller', location: 'Amsterdam', avatarUrl: null },
      currentUser: { id: 'buyer-youtube-226', username: 'sample-buyer' },
      currentProfile: null,
      isSeller: false,
      isFavorited: false,
      messagingEnabled: false,
      comments: [],
      commentsInitiallyOpen: false,
      commentError: null,
      submittedContent: '',
      getIconSvg: () => '<svg aria-hidden="true" viewBox="0 0 24 24"></svg>',
    }, { filename: detailPath });
    const body = renderedDetail.replace('<script src="/js/youtube-preview.js" defer></script>', '');

    const browser: Browser = await chromium.launch({ headless: true });
    try {
      for (const width of [320, 360, 390, 430, 768, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.setContent(
          '<!doctype html><html lang="en"><head><style>' + stylesheet
          + '</style></head><body class="listing-detail-page"><main class="main-content container">'
          + body + '</main></body></html>'
        );

        const measurements = await page.evaluate(() => {
          const cover = document.querySelector('.primary-photo-wrapper');
          const image = document.querySelector('.listing-main-photo');
          const box = cover?.getBoundingClientRect();
          const title = document.querySelector('.listing-title')?.getBoundingClientRect();
          const price = document.querySelector('.listing-price-amount')?.getBoundingClientRect();
          const condition = document.querySelector('.condition-section')?.getBoundingClientRect();
          const commentsLink = window.innerWidth < 768
            ? document.querySelector('.listing-comments-entry-link')?.getBoundingClientRect()
            : document.querySelector('.listing-comments-disclosure > summary')?.getBoundingClientRect();
          return {
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            coverWidth: box?.width ?? 0,
            coverHeight: box?.height ?? 0,
            imageObjectFit: image ? getComputedStyle(image).objectFit : '',
            titleTop: title?.top ?? Number.POSITIVE_INFINITY,
            priceTop: price?.top ?? Number.POSITIVE_INFINITY,
            conditionTop: condition?.top ?? Number.POSITIVE_INFINITY,
            favoriteButtonVisible: Boolean(document.querySelector('.listing-favorite-form .btn')?.getBoundingClientRect().height),
            sellerLinkVisible: Boolean(document.querySelector('.seller-card-action .btn')?.getBoundingClientRect().height),
            commentsEntryVisible: Boolean(commentsLink?.height),
          };
        });

        expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
        expect(measurements.coverWidth).toBeGreaterThan(0);
        expect(Math.abs(measurements.coverWidth - measurements.coverHeight)).toBeLessThanOrEqual(1.5);
        expect(measurements.imageObjectFit).toBe('contain');
        expect(measurements.titleTop).toBeLessThan(900);
        expect(measurements.priceTop).toBeLessThan(1050);
        expect(measurements.conditionTop).toBeLessThan(1200);
        expect(measurements.favoriteButtonVisible).toBe(true);
        expect(measurements.sellerLinkVisible).toBe(true);
        expect(measurements.commentsEntryVisible).toBe(true);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });

  it('uses the shared mobile header back control for a listing detail route and does not mark + Drop active', () => {
    const locals = {
      currentPath: '/listings/' + listingId,
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    };
    const renderedHeader = ejs.render(headerTemplate, locals, { filename: headerPath });
    const renderedNav = ejs.render(navTemplate, locals, { filename: navPath });

    expect(renderedHeader).toContain('<span class="mobile-context-heading">RECORD</span>');
    expect(renderedHeader).toContain('aria-label="Back to Dig results"');
    expect(renderedHeader).toContain('href="/dig"');
    expect(renderedNav).toContain('href="/drop/new" class="nav-link nav-link-action"');
    expect(renderedNav).toContain('href="/drop/new" class="mobile-nav-item mobile-nav-drop"');
    expect(mainLayoutTemplate).toContain('listing-detail-page');
    expect(stylesheet).toContain('body.listing-detail-page .main-content');
    expect(stylesheet).toContain('env(safe-area-inset-bottom, 0px)');

    const previewHeader = ejs.render(headerTemplate, {
      ...locals,
      currentPath: '/listings/' + listingId + '/preview',
    }, { filename: headerPath });
    expect(previewHeader).not.toContain('<span class="mobile-context-heading">RECORD</span>');
    expect(previewHeader).not.toContain('aria-label="Back to Dig results"');
  });
});
