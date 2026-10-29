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

describe('Route-specific CSS bundles (#252)', () => {
  it('loads route-only stylesheets only on their owner pages and preserves original source order', async () => {
    const home = cssLinks(await renderLayout('/'));
    const dig = cssLinks(await renderLayout('/dig'));
    const myListings = cssLinks(await renderLayout('/listings'));
    const listingDetail = cssLinks(await renderLayout('/listings/example-listing'));

    expect(home).toEqual([
      '/css/style.css',
      '/css/style-between-features.css',
      '/css/style-after-features.css',
    ]);
    expect(dig).toEqual([
      '/css/style.css',
      '/css/dig-experience.css',
      '/css/style-between-features.css',
      '/css/style-after-features.css',
      '/css/dig-mobile-crate.css',
    ]);
    expect(myListings).toEqual([
      '/css/style.css',
      '/css/style-between-features.css',
      '/css/my-listings.css',
      '/css/style-after-features.css',
    ]);
    expect(listingDetail).toEqual([
      '/css/style.css',
      '/css/style-between-features.css',
      '/css/style-after-features.css',
    ]);
    expect(home).not.toContain('/css/dig-experience.css');
    expect(home).not.toContain('/css/my-listings.css');
    expect(dig).not.toContain('/css/my-listings.css');
    expect(myListings).not.toContain('/css/dig-experience.css');
    expect(listingDetail).not.toContain('/css/my-listings.css');
    expect(listingDetail).not.toContain('/css/dig-experience.css');
  });

  it('retains the original CSS region order when reconstructed for source-level tests', () => {
    const reconstructed = readReconstructedMainStylesheet();
    const sections = [
      'Crate Dig — physical sleeve stack',
      'Responsive physical-listing detail page',
      'My Listings Management',
      'Shared artwork fallbacks, Activity cards, and release selection responsiveness',
    ].map((marker) => reconstructed.indexOf(marker));

    expect(sections.every((position) => position >= 0)).toBe(true);
    expect(sections).toEqual([...sections].sort((a, b) => a - b));
    expect(Buffer.byteLength(reconstructed)).toBeGreaterThan(190000);
  });

  it('reports reproducible raw and gzip transfer sizes and reduces shared-page CSS payload', () => {
    const baseline = readReconstructedMainStylesheet();
    const baselineBuffer = Buffer.from(baseline);
    const digMobile = fileContent('dig-mobile-crate.css');
    const baselineShared = {
      rawBytes: baselineBuffer.byteLength,
      gzipBytes: gzipSync(baselineBuffer).byteLength,
    };
    const baselineDig = {
      rawBytes: baselineBuffer.byteLength + digMobile.byteLength,
      gzipBytes: gzipSync(baselineBuffer).byteLength + gzipSync(digMobile).byteLength,
    };
    const after = {
      general: routeMetrics(['style.css', 'style-between-features.css', 'style-after-features.css']),
      dig: routeMetrics(['style.css', 'dig-experience.css', 'style-between-features.css', 'style-after-features.css', 'dig-mobile-crate.css']),
      myListings: routeMetrics(['style.css', 'style-between-features.css', 'my-listings.css', 'style-after-features.css']),
    };

    console.info('[CSS bundle size report #252]', JSON.stringify({
      before: { shared: baselineShared, dig: baselineDig, myListings: baselineShared },
      after,
      rawBytesSaved: {
        shared: baselineShared.rawBytes - after.general.rawBytes,
        dig: baselineDig.rawBytes - after.dig.rawBytes,
        myListings: baselineShared.rawBytes - after.myListings.rawBytes,
      },
      gzipBytesSaved: {
        shared: baselineShared.gzipBytes - after.general.gzipBytes,
        dig: baselineDig.gzipBytes - after.dig.gzipBytes,
        myListings: baselineShared.gzipBytes - after.myListings.gzipBytes,
      },
    }));

    expect(after.general.rawBytes).toBeLessThan(baselineShared.rawBytes);
    expect(after.general.gzipBytes).toBeLessThan(baselineShared.gzipBytes);
    expect(after.dig.rawBytes).toBeLessThan(baselineDig.rawBytes);
    expect(after.myListings.rawBytes).toBeLessThan(baselineShared.rawBytes);
  });
});
