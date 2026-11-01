/// <reference lib="dom" />
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { AddressInfo, Server } from 'node:net';
import ejs from 'ejs';
import { chromium } from '@playwright/test';
import { getIconSvg } from '../src/app/utils/iconRegistry';
import { readFullStylesheetSource } from '../test/stylesheetTestHelper';
import {
  LISTING_PHOTO_ROLES,
  LISTING_PHOTO_ROLE_GUIDANCE,
  LISTING_PHOTO_ROLE_LABELS,
  NEW_LISTING_PHOTO_ROLES,
} from '../src/domain/listingPhotoRole';
import { VINYL_FORMAT_FILTERS } from '../src/domain/releaseFormat';

const root = process.cwd();
const views = path.join(root, 'views');
const publicDirectory = path.join(root, 'public');
const evidenceDirectory = process.env.UI_EVIDENCE_DIR || '';

if (!evidenceDirectory) {
  throw new Error('UI_EVIDENCE_DIR must be set so screenshots are written to an explicit evidence folder.');
}

const stylesheet = readFullStylesheetSource();
const testUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'digger@example.test',
};
const testProfile = {
  id: testUser.id,
  username: 'crate_digger',
  displayName: 'Crate Digger',
};

async function renderView(relativePath: string, locals: Record<string, unknown>): Promise<string> {
  const filename = path.join(views, relativePath);
  return ejs.renderFile(filename, { getIconSvg, ...locals }, { filename });
}

async function renderHeader(currentPath: string): Promise<string> {
  return renderView('partials/header.ejs', {
    currentPath,
    currentUser: testUser,
    currentProfile: testProfile,
    messagingEnabled: false,
    betaInviteOnly: false,
    inviteOnlyAccessMessage: '',
    showBetaWelcome: false,
  });
}

function documentHtml(baseUrl: string, header: string, body: string): string {
  const safeBody = body.replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/gi, '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${baseUrl}/">
  <link rel="stylesheet" href="${baseUrl}/fonts/fonts.css">
  <style>${stylesheet}</style>
</head>
<body>
  ${header}
  <main class="main-content container">${safeBody}</main>
</body>
</html>`;
}

async function makePages(baseUrl: string): Promise<Array<{
  name: string;
  html: string;
  searchSelector?: string;
}>> {
  const browse = await renderView('browse/index.ejs', {
    title: 'Browse',
    listings: [{
      id: 'listing-ui-evidence',
      title: '3 Feet High and Rising',
      artist: 'De La Soul',
      sellerUsername: 'crate_digger',
      sellerLocation: 'Amsterdam',
      imageUrl: '/assets/vinyl-placeholder.svg',
      priceFormatted: '€25.00',
    }],
    filters: {
      q: 'De La Soul',
      genre: 'Hip Hop',
      condition: 'VG+',
      minPrice: '10',
      maxPrice: '50',
      sort: 'price_asc',
      view: 'grid',
      formats: ['lp'],
      whiteLabel: false,
    },
    pagination: { totalCount: 0, page: 1, limit: 12, totalPages: 1 },
    formatOptions: VINYL_FORMAT_FILTERS,
    whiteLabelAvailable: true,
  });

  const dig = await renderView('browse/responsive-dig.ejs', {
    title: 'Dig — The Vinyl Drop',
    listings: [],
    items: [],
    totalCount: 0,
    hasMore: false,
    filters: {
      q: 'De La Soul',
      genre: 'Hip Hop',
      condition: 'VG+',
      minPrice: '10',
      maxPrice: '50',
      sort: 'newest',
      formats: ['LP'],
      whiteLabel: false,
      view: 'grid',
    },
    pagination: { totalCount: 0, page: 1, limit: 12, totalPages: 1 },
    formatOptions: [
      { value: 'LP', label: 'LP', description: 'Long-play records' },
      { value: '12-inch', label: '12-inch', description: '12-inch records' },
      { value: '7-inch', label: '7-inch', description: '7-inch records' },
    ],
    whiteLabelAvailable: true,
    errorMessage: null,
  });

  const releaseSelection = await renderView('listings/select-release.ejs', {
    query: 'De La Soul',
    searchResults: [],
    releases: [],
  });

  const createListing = await renderView('listings/create.ejs', {
    release: {
      id: 'release-ui-evidence',
      title: 'Kind of Blue',
      artist: 'Miles Davis',
      label: 'Columbia',
      releaseYear: 1959,
    },
    form: {
      values: {
        releaseId: 'release-ui-evidence',
        mediaCondition: 'NM',
        sleeveCondition: 'NM',
        priceEur: '24.95',
        tradeAvailable: 'false',
        description: '',
        notes: '',
      },
      fieldErrors: {},
      generalErrors: [],
    },
  });

  const editListing = await renderView('listings/edit.ejs', {
    listing: {
      id: '11111111-1111-4111-8111-111111111111',
      price: 2500,
      tradeAvailable: false,
      description: '',
    },
    release: {
      title: 'Kind of Blue',
      artist: 'Miles Davis',
      releaseYear: 1959,
      coverArtUrl: null,
      youtubeVideoId: null,
    },
    physicalCopy: { mediaCondition: 'NM', sleeveCondition: 'VG+', notes: '' },
    photos: [],
    form: { values: {}, fieldErrors: {}, generalErrors: [] },
    photoRoles: LISTING_PHOTO_ROLES,
    newPhotoRoles: NEW_LISTING_PHOTO_ROLES,
    photoRoleLabels: LISTING_PHOTO_ROLE_LABELS,
    photoRoleGuidance: LISTING_PHOTO_ROLE_GUIDANCE,
    photoError: '',
    youtubePreviewError: null,
  });

  const profileEdit = await renderView('profiles/edit.ejs', {
    profile: testProfile,
    form: {
      values: {
        username: 'crate_digger',
        displayName: 'Crate Digger',
        location: 'Amsterdam',
        websiteUrl: 'https://example.test',
        avatarUrl: '',
        bio: 'Hip-hop, soul and dusty samples.',
      },
      fieldErrors: {},
      generalErrors: [],
    },
  });

  const activity = await renderView('activity/index.ejs', {
    events: [
      {
        listingUrl: '/listings/example-listing',
        releaseTitle: 'Sex Machine',
        releaseArtist: 'James Brown',
        listingArtworkUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        releaseCoverArtUrl: null,
        artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
        actorAvatarUrl: null,
        actorUsername: 'crate_digger',
        eventDescription: '@crate_digger published a drop',
        timeAgo: '2d ago',
        eventType: 'listing.published',
        commentContent: null,
        priceFormatted: '€7.00',
        isPrivate: false,
      },
      {
        listingUrl: '/listings/another-listing',
        releaseTitle: 'Take It Back (Extended Club Mix)',
        releaseArtist: 'A Different Artist Name',
        listingArtworkUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        releaseCoverArtUrl: null,
        artworkFallbackUrl: '/assets/vinyl-placeholder.svg',
        actorAvatarUrl: null,
        actorUsername: 'recordfan',
        eventDescription: '@recordfan commented on a drop',
        timeAgo: '1h ago',
        eventType: 'comment.created',
        commentContent: 'A longer comment that should wrap naturally across the available card width.',
        priceFormatted: '',
        isPrivate: false,
      },
    ],
  });

  const entries = [
    { name: 'browse', route: '/browse', body: browse, searchSelector: '#search-q' },
    { name: 'dig', route: '/dig', body: dig, searchSelector: '#dig-primary-search' },
    { name: 'drop-select-release', route: '/drop/new', body: releaseSelection, searchSelector: '.select-release-search-form input[name="q"]' },
    { name: 'listing-create', route: '/listings/create', body: createListing },
    { name: 'listing-edit', route: '/listings/11111111-1111-4111-8111-111111111111/edit', body: editListing },
    { name: 'profile-edit', route: '/profile/edit', body: profileEdit },
    { name: 'activity', route: '/activity', body: activity },
  ];

  const pages = [];
  for (const entry of entries) {
    const header = await renderHeader(entry.route);
    pages.push({
      name: entry.name,
      html: documentHtml(baseUrl, header, entry.body),
      searchSelector: entry.searchSelector,
    });
  }
  return pages;
}

async function run(): Promise<void> {
  const evidencePath = path.resolve(root, evidenceDirectory);
  fs.mkdirSync(evidencePath, { recursive: true });

  const staticApp = express();
  staticApp.use(express.static(publicDirectory));
  const server: Server = staticApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];

  try {
    const pages = await makePages(baseUrl);
    const viewports = [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ];

    for (const surface of pages) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        try {
          await page.setContent(surface.html, { waitUntil: 'load', timeout: 15000 });
          if (surface.name === 'browse') {
            await page.locator('.browse-mobile-filter-panel').evaluate((element) => {
              (element as HTMLDetailsElement).open = true;
            });
          }

          const dimensions = await page.evaluate(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }));
          assert.equal(dimensions.viewport, viewport.width, `${surface.name}: viewport width mismatch`);
          assert.ok(
            dimensions.document <= viewport.width + 1 && dimensions.body <= viewport.width + 1,
            `${surface.name} at ${viewport.width}px overflows horizontally (document ${dimensions.document}px, body ${dimensions.body}px)`
          );

          if (surface.searchSelector) {
            const search = page.locator(surface.searchSelector).first();
            if (await search.isVisible()) {
              const state = await search.evaluate((element) => {
                const input = element as HTMLInputElement;
                const style = getComputedStyle(input);
                const rect = input.getBoundingClientRect();
                const labels = input.labels ? Array.from(input.labels).map((label) => label.textContent?.trim() || '') : [];
                return {
                  height: rect.height,
                  paddingLeft: parseFloat(style.paddingLeft),
                  accessibleName: Boolean(input.getAttribute('aria-label') || labels.some(Boolean)),
                };
              });
              assert.ok(state.height >= 44, `${surface.name} search control is shorter than 44px at ${viewport.width}px: ${state.height}px`);
              assert.ok(state.paddingLeft >= 40, `${surface.name} search text is too close to the search icon at ${viewport.width}px: ${state.paddingLeft}px`);
              assert.ok(state.accessibleName, `${surface.name} search control has no programmatic label`);

              let reachedByKeyboard = false;
              for (let tab = 0; tab < 60; tab += 1) {
                await page.keyboard.press('Tab');
                if (await search.evaluate((element) => element === document.activeElement)) {
                  reachedByKeyboard = true;
                  break;
                }
              }
              assert.ok(reachedByKeyboard, `${surface.name} search control is not reachable by keyboard at ${viewport.width}px`);
              const outlineWidth = await search.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth));
              assert.ok(outlineWidth >= 3, `${surface.name} search control has no visible keyboard focus at ${viewport.width}px`);
            }
          }

          const screenshotPath = path.resolve(
            evidencePath,
            `${surface.name}-${viewport.width}px.png`
          );
          await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
          console.log(`[ui-evidence] PASS ${surface.name} @ ${viewport.width}px — no overflow`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(message);
          console.error(`[ui-evidence] FAIL ${surface.name} @ ${viewport.width}px: ${message}`);
        } finally {
          await page.close();
        }
      }
    }

    assert.equal(failures.length, 0, failures.join('\n'));
    console.log(`[ui-evidence] Captured ${pages.length * viewports.length} screenshots in ${evidencePath}`);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

run().catch((error) => {
  console.error('[ui-evidence] Browser verification failed:', error);
  process.exitCode = 1;
});
