import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { VINYL_FORMAT_FILTERS } from '../src/domain/releaseFormat';

const BASE_URL = 'https://thevinyldrop.test';

async function renderBrowseExplorer(
  filters: Partial<{
    q: string;
    genre: string;
    condition: string;
    minPrice: string;
    maxPrice: string;
    sort: string;
    view: string;
    formats: string[];
    whiteLabel: boolean;
  }> = {}
): Promise<string> {
  return ejs.renderFile(path.join(process.cwd(), 'views/browse/index.ejs'), {
    title: 'Browse',
    listings: [],
    filters: {
      q: '',
      genre: '',
      condition: '',
      minPrice: '',
      maxPrice: '',
      sort: 'newest',
      view: 'grid',
      formats: [],
      whiteLabel: false,
      ...filters,
    },
    pagination: { totalCount: 0, page: 1, limit: 12, totalPages: 1 },
    formatOptions: VINYL_FORMAT_FILTERS,
    genreOptions: ['Hip Hop', 'Funk / Soul', 'Jazz'],
    whiteLabelAvailable: false,
    errorMessage: null,
  });
}

function explorerHref(html: string, attribute: string): URL {
  const anchors = Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g));
  const anchor = anchors.find(([, attributes]) => attributes.includes(attribute));
  if (!anchor) throw new Error(`Could not find Explorer link with ${attribute}`);
  const href = anchor[1].match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error(`Explorer link with ${attribute} has no href`);
  return new URL(href.replace(/&amp;/g, '&'), BASE_URL);
}

describe('Desktop Browse Catalogue Explorer', () => {
  it('preserves unrelated query state and clears only genre and formats for All records', async () => {
    const html = await renderBrowseExplorer({
      q: 'De La Soul',
      genre: 'Hip Hop',
      condition: 'VG+',
      minPrice: '5',
      maxPrice: '500',
      sort: 'price_asc',
      view: 'list',
      formats: ['lp', '7-inch'],
      whiteLabel: true,
    });

    const url = explorerHref(html, 'data-explorer-all');
    expect(url.pathname).toBe('/browse');
    expect(url.searchParams.get('q')).toBe('De La Soul');
    expect(url.searchParams.get('genre')).toBeNull();
    expect(url.searchParams.getAll('format')).toEqual([]);
    expect(url.searchParams.get('condition')).toBe('VG+');
    expect(url.searchParams.get('minPrice')).toBe('5');
    expect(url.searchParams.get('maxPrice')).toBe('500');
    expect(url.searchParams.get('sort')).toBe('price_asc');
    expect(url.searchParams.get('whiteLabel')).toBe('1');
    expect(url.searchParams.get('view')).toBe('list');
    expect(url.searchParams.get('page')).toBeNull();
  });

  it('replaces the single genre while preserving all selected formats and other filters', async () => {
    const html = await renderBrowseExplorer({
      q: 'De La Soul',
      genre: 'Hip Hop',
      condition: 'VG+',
      minPrice: '5',
      maxPrice: '500',
      sort: 'price_asc',
      view: 'grid',
      formats: ['lp', '7-inch'],
      whiteLabel: true,
    });

    const url = explorerHref(html, 'data-explorer-genre="Funk / Soul"');
    expect(url.pathname).toBe('/browse');
    expect(url.searchParams.get('genre')).toBe('Funk / Soul');
    expect(url.searchParams.getAll('format')).toEqual(['lp', '7-inch']);
    expect(url.searchParams.get('q')).toBe('De La Soul');
    expect(url.searchParams.get('condition')).toBe('VG+');
    expect(url.searchParams.get('minPrice')).toBe('5');
    expect(url.searchParams.get('maxPrice')).toBe('500');
    expect(url.searchParams.get('sort')).toBe('price_asc');
    expect(url.searchParams.get('whiteLabel')).toBe('1');
    expect(url.searchParams.get('view')).toBe('grid');
    expect(url.searchParams.get('page')).toBeNull();
  });

  it('toggles one format at a time without losing the genre or other selected formats', async () => {
    const html = await renderBrowseExplorer({
      genre: 'Hip Hop',
      formats: ['lp', '7-inch'],
      view: 'list',
    });

    const removeLp = explorerHref(html, 'data-explorer-format="lp"');
    expect(removeLp.searchParams.get('genre')).toBe('Hip Hop');
    expect(removeLp.searchParams.getAll('format')).toEqual(['7-inch']);
    expect(removeLp.searchParams.get('view')).toBe('list');
    expect(removeLp.searchParams.get('page')).toBeNull();

    const addTwelveInch = explorerHref(html, 'data-explorer-format="12-inch"');
    expect(addTwelveInch.searchParams.get('genre')).toBe('Hip Hop');
    expect(addTwelveInch.searchParams.getAll('format')).toEqual(['lp', '7-inch', '12-inch']);
    expect(addTwelveInch.searchParams.get('view')).toBe('list');
  });

  it('renders the disclosure open by default and marks selected entries accessibly', async () => {
    const html = await renderBrowseExplorer({
      genre: 'Funk / Soul',
      formats: ['12-inch'],
    });

    expect(html).toMatch(/<details class="browse-explorer-disclosure" open>/);
    expect(html).toContain('<span class="browse-explorer-summary-selection">Funk / Soul · 12-inch</span>');
    expect(html).toContain('data-explorer-genre="Funk / Soul"');
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/data-explorer-format="12-inch"[\s\S]*?aria-current="page"/);
    expect(html).toContain('aria-label="Catalogue explorer"');
    expect(html).toContain('aria-label="Browse catalogue"');
  });

  it('shows a permanent rail only at desktop widths and keeps result columns readable', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'public/css/browse-catalogue-explorer.css'), 'utf8');
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('grid-template-columns: minmax(190px, 216px) minmax(0, 1fr)');
    expect(css).toContain('@media (min-width: 1280px)');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(248px, 1fr))');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(248px, 1fr))');
    expect(css).toContain('@media (max-width: 1023px)');
    expect(css).toContain('.browse-catalogue-explorer {\n    display: none !important;');
  });
});
