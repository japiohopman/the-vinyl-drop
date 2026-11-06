import { createHash } from 'crypto';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { readReconstructedMainStylesheet } from './stylesheetTestHelper';

const layoutPath = path.join(process.cwd(), 'views/layouts/main.ejs');
const cssDirectory = path.join(process.cwd(), 'public/css');

async function renderLayout(currentPath: string): Promise<string> {
  return ejs.renderFile(layoutPath, {
    title: 'CSS route bundle test',
    currentPath,
    body: '<p>Test page content</p>',
    currentUser: null,
    currentProfile: null,
    messagingEnabled: false,
    betaInviteOnly: false,
    inviteOnlyAccessMessage: '',
    showBetaWelcome: false,
    flashMessages: [],
    listings: [],
    items: [],
    releases: [],
    getIconSvg: () => '<svg aria-hidden="true"></svg>',
    versionedCssAssetUrl: (assetUrl: string) => `${assetUrl}?v=test-version`,
  }, { filename: layoutPath });
}

function cssLinks(html: string): string[] {
  return Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g))
    .map((match) => match[1].split('?')[0])
    .filter((href) => href.startsWith('/css/'));
}

function routeCssLinks(html: string): string[] {
  const links = cssLinks(html);
  const themeLinks = links.filter((href) => href === '/css/themes.css');
  if (themeLinks.length !== 1 || links[links.length - 1] !== '/css/themes.css') {
    throw new Error('Every route must load the shared theme token layer exactly once, after its route stylesheets.');
  }
  return links.filter((href) => href !== '/css/themes.css');
}

function fileContent(filename: string): Buffer {
  return fs.readFileSync(path.join(cssDirectory, filename));
}

function routeMetrics(filenames: string[]): { rawBytes: number; gzipBytes: number } {
  const contents = filenames.map(fileContent);
  return {
    rawBytes: contents.reduce((total, content) => total + content.byteLength, 0),
    // CSS responses are individually compressed in production, so sum each gzip member.
    gzipBytes: contents.reduce((total, content) => total + gzipSync(content).byteLength, 0),
  };
}

const sharedBundles = [
  'style.css',
  'style-after-features.css',
  'style-after-activity.css',
  'style-after-release-selection.css',
  'style-after-listing-forms.css',
  'style-after-profile-pages.css',
  'style-after-profile-editor.css',
];

describe('Route-specific CSS bundles (#252)', () => {
  it('loads only each route’s feature bundles and preserves original stylesheet order', async () => {
    const home = routeCssLinks(await renderLayout('/'));
    const dig = routeCssLinks(await renderLayout('/dig'));
    const browse = routeCssLinks(await renderLayout('/browse'));
    const search = routeCssLinks(await renderLayout('/search'));
    const people = routeCssLinks(await renderLayout('/people'));
    const browseDig = routeCssLinks(await renderLayout('/browse/dig'));
    const myListings = routeCssLinks(await renderLayout('/listings'));
    const listingDetail = routeCssLinks(await renderLayout('/listings/example-listing'));
    const listingComments = routeCssLinks(await renderLayout('/listings/example-listing/comments'));
    const activity = routeCssLinks(await renderLayout('/activity'));
    const selectRelease = routeCssLinks(await renderLayout('/listings/new'));
    const dropNew = routeCssLinks(await renderLayout('/drop/new'));
    const listingCreate = routeCssLinks(await renderLayout('/listings/create'));
    const listingEdit = routeCssLinks(await renderLayout('/listings/example-listing/edit'));
    const profile = routeCssLinks(await renderLayout('/profile'));
    const publicProfile = routeCssLinks(await renderLayout('/profiles/crate_digger'));
    const profileEdit = routeCssLinks(await renderLayout('/profile/edit'));

    expect(home).toEqual([
      ...sharedBundles.map((name) => `/css/${name}`),
      '/css/home.css',
    ]);
    expect(dig).toEqual([
      '/css/style.css', '/css/dig-experience.css',
      '/css/style-after-features.css', '/css/browse-dig-controls.css', '/css/style-after-activity.css',
      '/css/style-after-release-selection.css', '/css/dig-mobile-session.css', '/css/style-after-listing-forms.css',
      '/css/style-after-profile-pages.css', '/css/style-after-profile-editor.css', '/css/people-search.css',
      '/css/dig-mobile-crate.css',
    ]);
    expect(browse).toEqual([
      '/css/style.css', '/css/style-after-features.css', '/css/browse-dig-controls.css',
      '/css/style-after-activity.css', '/css/style-after-release-selection.css',
      '/css/style-after-listing-forms.css', '/css/style-after-profile-pages.css', '/css/style-after-profile-editor.css',
      '/css/people-search.css',
    ]);
    expect(search).toContain('/css/people-search.css');
    expect(people).toContain('/css/people-search.css');
    expect(browseDig).toContain('/css/dig-experience.css');
    expect(browseDig).toContain('/css/browse-dig-controls.css');
    expect(browseDig).toContain('/css/people-search.css');
    expect(browseDig).not.toContain('/css/dig-mobile-session.css');
    expect(myListings).toEqual([
      '/css/style.css', '/css/my-listings.css',
      '/css/style-after-features.css', '/css/style-after-activity.css',
      '/css/style-after-release-selection.css', '/css/style-after-listing-forms.css',
      '/css/style-after-profile-pages.css', '/css/style-after-profile-editor.css',
    ]);
    expect(listingDetail).toEqual([
      '/css/style.css', '/css/listing-detail.css',
      '/css/style-after-features.css', '/css/style-after-activity.css',
      '/css/style-after-release-selection.css', '/css/style-after-listing-forms.css',
      '/css/style-after-profile-pages.css', '/css/style-after-profile-editor.css',
      '/css/listing-interactions.css', '/css/listing-detail-polish.css',
    ]);
    expect(listingComments).toEqual([
      ...sharedBundles.map((name) => `/css/${name}`),
      '/css/listing-interactions.css',
    ]);
    expect(activity).toEqual([
      '/css/style.css', '/css/style-after-features.css', '/css/activity-release-selection.css',
      '/css/style-after-activity.css', '/css/style-after-release-selection.css',
      '/css/style-after-listing-forms.css', '/css/style-after-profile-pages.css', '/css/style-after-profile-editor.css',
    ]);
    expect(selectRelease).toEqual([
      '/css/style.css', '/css/style-after-features.css',
      '/css/activity-release-selection.css', '/css/style-after-activity.css',
      '/css/release-selection-overrides.css', '/css/style-after-release-selection.css',
      '/css/style-after-listing-forms.css', '/css/style-after-profile-pages.css',
      '/css/style-after-profile-editor.css',
    ]);
    expect(selectRelease).not.toContain('/css/listing-detail.css');
    expect(selectRelease).not.toContain('/css/listing-interactions.css');
    expect(listingCreate).not.toContain('/css/listing-interactions.css');
    expect(selectRelease).not.toContain('/css/browse-dig-controls.css');
    expect(selectRelease).not.toContain('/css/dig-mobile-session.css');
    for (const formRoute of [dropNew, listingCreate, listingEdit]) {
      expect(formRoute).toContain('/css/listing-forms.css');
      expect(formRoute.indexOf('/css/listing-forms.css'))
        .toBeLessThan(formRoute.indexOf('/css/style-after-listing-forms.css'));
    }
    expect(listingEdit).toContain('/css/listing-interactions.css');
    expect(listingEdit.indexOf('/css/style-after-profile-editor.css'))
      .toBeLessThan(listingEdit.indexOf('/css/listing-interactions.css'));
    expect(listingEdit).toContain('/css/listing-interactions.css');
    expect(profile).toContain('/css/profile-pages.css');
    expect(publicProfile).toContain('/css/profile-pages.css');
    expect(profileEdit).toContain('/css/profile-editor.css');
    expect(profileEdit).not.toContain('/css/profile-pages.css');

    for (const unrelated of [home, myListings, listingDetail, listingComments, activity, selectRelease]) {
      expect(unrelated).not.toContain('/css/listing-forms.css');
    }
    expect(home).not.toContain('/css/activity-release-selection.css');
    expect(home).not.toContain('/css/release-selection-overrides.css');
    expect(home).not.toContain('/css/dig-experience.css');
    for (const nonHomeRoute of [dig, browse, search, people, browseDig, myListings, listingDetail, listingComments, activity, selectRelease, dropNew, listingCreate, listingEdit, profile, publicProfile, profileEdit]) {
      expect(nonHomeRoute).not.toContain('/css/home.css');
    }
    expect(home).not.toContain('/css/browse-dig-controls.css');
    for (const unrelated of [home, myListings, listingDetail, listingComments, activity, selectRelease, dropNew, listingCreate, listingEdit, profile, publicProfile, profileEdit]) {
      expect(unrelated).not.toContain('/css/people-search.css');
    }
    expect(home).not.toContain('/css/dig-mobile-session.css');
    expect(home).not.toContain('/css/my-listings.css');
    expect(home).not.toContain('/css/listing-detail.css');
    expect(home).not.toContain('/css/listing-interactions.css');
    expect(home).not.toContain('/css/listing-detail-polish.css');
    expect(listingComments).not.toContain('/css/listing-detail-polish.css');
    expect(myListings).not.toContain('/css/listing-detail-polish.css');
    expect(dig).not.toContain('/css/listing-detail-polish.css');
    expect(dig).not.toContain('/css/activity-release-selection.css');
    expect(dig).not.toContain('/css/profile-pages.css');
    expect(dig).not.toContain('/css/profile-editor.css');
    expect(myListings).not.toContain('/css/dig-experience.css');
    expect(myListings).not.toContain('/css/listing-detail.css');
    expect(listingDetail).not.toContain('/css/my-listings.css');
    expect(listingDetail).not.toContain('/css/dig-experience.css');
    expect(profile).not.toContain('/css/profile-editor.css');
    expect(profileEdit).not.toContain('/css/listing-forms.css');
  });

  it('reconstructs the original CSS source order for isolated regression tests', () => {
    const reconstructed = readReconstructedMainStylesheet();
    const sections = [
      'Crate Dig — physical sleeve stack',
      'Responsive physical-listing detail page',
      'My Listings Management',
      'Shared artwork fallbacks, Activity cards, and release selection responsiveness',
      'Activity',
      'Dig is one product destination',
      'Drop entry: focus on artist/title',
      'Issue #126 — progressive desktop messaging widget',
      'Profile / Crate split — Issue #202',
      'Issue #211 — mobile-first conversation panel polish',
      'Issue #237 — restrained, responsive profile editor',
      'Keep the send control reachable in short desktop widget viewports',
      'Issue #226 — optional release-level YouTube preview',
    ].map((marker) => reconstructed.indexOf(marker));

    expect(sections.every((position) => position >= 0)).toBe(true);
    expect(sections).toEqual([...sections].sort((a, b) => a - b));
    expect(Buffer.byteLength(reconstructed)).toBeGreaterThan(190000);
    const gitBlobSha = createHash('sha1')
      .update(`blob ${Buffer.byteLength(reconstructed)}\0`)
      .update(reconstructed)
      .digest('hex');
    // Update this snapshot when intentionally changing the reconstructed shared stylesheet.
    expect(gitBlobSha).toBe('7a714d3b703ecf8d911e3f2124e6b6efe8d188f6');
  });

  it('reports reproducible raw/gzip sizes and validates savings per route', () => {
    const baseline = Buffer.from(readReconstructedMainStylesheet());
    const digMobile = fileContent('dig-mobile-crate.css');
    const baselineShared = {
      rawBytes: baseline.byteLength,
      gzipBytes: gzipSync(baseline).byteLength,
    };
    const baselineDig = {
      rawBytes: baseline.byteLength + digMobile.byteLength,
      gzipBytes: gzipSync(baseline).byteLength + gzipSync(digMobile).byteLength,
    };
    const after = {
      general: routeMetrics(sharedBundles),
      home: routeMetrics([...sharedBundles, 'home.css']),
      dig: routeMetrics(['style.css', 'dig-experience.css', 'style-after-features.css', 'browse-dig-controls.css', ...sharedBundles.slice(2), 'dig-mobile-session.css', 'people-search.css', 'dig-mobile-crate.css']),
      browse: routeMetrics(['style.css', 'style-after-features.css', 'browse-dig-controls.css', ...sharedBundles.slice(2), 'people-search.css']),
      peopleSearch: routeMetrics([...sharedBundles, 'people-search.css']),
      myListings: routeMetrics(['style.css', 'my-listings.css', ...sharedBundles.slice(1)]),
      listingDetail: routeMetrics(['style.css', 'listing-detail.css', ...sharedBundles.slice(1), 'listing-interactions.css', 'listing-detail-polish.css']),
      listingComments: routeMetrics([...sharedBundles, 'listing-interactions.css']),
      activity: routeMetrics(['style.css', 'style-after-features.css', 'activity-release-selection.css', ...sharedBundles.slice(2)]),
      selectRelease: routeMetrics(['style.css', 'style-after-features.css', 'activity-release-selection.css', 'style-after-activity.css', 'release-selection-overrides.css', 'style-after-release-selection.css', ...sharedBundles.slice(4)]),
      listingForms: routeMetrics(['style.css', ...sharedBundles.slice(1, 4), 'listing-forms.css', ...sharedBundles.slice(4), 'listing-interactions.css']),
      profile: routeMetrics([...sharedBundles.slice(0, 5), 'profile-pages.css', ...sharedBundles.slice(5)]),
      profileEdit: routeMetrics([...sharedBundles.slice(0, 5), sharedBundles[5], 'profile-editor.css', sharedBundles[6]]),
    };

    const before = {
      shared: baselineShared, home: baselineShared, dig: baselineDig, browse: baselineShared, peopleSearch: baselineShared, myListings: baselineShared,
      listingDetail: baselineShared, listingComments: baselineShared,
      activity: baselineShared, selectRelease: baselineShared,
      listingForms: baselineShared, profile: baselineShared, profileEdit: baselineShared,
    };
    const payload = { before, after };
    console.info('[CSS bundle size report #252]', JSON.stringify({
      ...payload,
      rawBytesSaved: Object.fromEntries(Object.entries(after).map(([key, value]) =>
        [key, (key === 'dig' ? baselineDig.rawBytes : baselineShared.rawBytes) - value.rawBytes])),
      gzipBytesSaved: Object.fromEntries(Object.entries(after).map(([key, value]) =>
        [key, (key === 'dig' ? baselineDig.gzipBytes : baselineShared.gzipBytes) - value.gzipBytes])),
    }));

    expect(after.general.rawBytes).toBeLessThan(baselineShared.rawBytes);
    expect(after.general.gzipBytes).toBeLessThan(baselineShared.gzipBytes);
    expect(after.dig.rawBytes).toBeLessThan(baselineDig.rawBytes);

    // Home deliberately loads its own small route-only stylesheet. It is the
    // sole route allowed to add a small visual layer over the shared baseline.
    expect(after.home.rawBytes - baselineShared.rawBytes).toBeLessThan(3500);
    expect(after.home.gzipBytes - baselineShared.gzipBytes).toBeLessThan(1500);

    for (const [key, value] of Object.entries(after)) {
      if (key === 'home') continue;
      expect(value.rawBytes).toBeLessThan((key === 'dig' ? baselineDig.rawBytes : baselineShared.rawBytes));
      expect(value.gzipBytes).toBeLessThan((key === 'dig' ? baselineDig.gzipBytes : baselineShared.gzipBytes));
    }
  });
});
