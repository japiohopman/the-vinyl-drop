import request from 'supertest';
import { createApp } from '../src/app';
import * as listingService from '../src/app/services/listingService';

jest.mock('../src/app/services/listingService', () => ({
  ...jest.requireActual('../src/app/services/listingService'),
  hasExplicitWhiteLabelInventory: jest.fn(),
  searchBrowseListings: jest.fn(),
  searchDigListings: jest.fn(),
}));

describe('Dig unified sidebar and first-load layout integration (Issue #393)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    (listingService.hasExplicitWhiteLabelInventory as jest.Mock).mockResolvedValue(true);
    (listingService.searchDigListings as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'item-1',
          title: 'Acid Tracks',
          artist: 'Phuture',
          releaseYear: 1987,
          format: '12-inch',
          priceFormatted: '€30.00',
          isTrade: false,
          mediaCondition: 'VG+',
          sleeveCondition: 'VG',
          sellerUsername: 'house_head',
          sellerLocation: 'Chicago',
          url: '/listings/item-1',
          imageUrl: '/assets/vinyl-placeholder.svg',
          frontArtwork: {
            src: '/assets/vinyl-placeholder.svg',
            altText: 'Acid Tracks front',
            sourceLabel: 'Placeholder',
            sourceKind: 'placeholder',
          },
          backArtwork: null,
          conditionSummary: 'Media VG+ · Sleeve VG',
        },
      ],
      totalCount: 1,
      hasMore: false,
    });
    (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'item-1',
          title: 'Acid Tracks',
          artist: 'Phuture',
          releaseYear: 1987,
          format: '12-inch',
          priceFormatted: '€30.00',
          isTrade: false,
          mediaCondition: 'VG+',
          sleeveCondition: 'VG',
          sellerUsername: 'house_head',
          sellerLocation: 'Chicago',
          url: '/listings/item-1',
          imageUrl: '/assets/vinyl-placeholder.svg',
        },
      ],
      totalCount: 1,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
  });

  it('renders the Records-only Dig filter sidebar without exposing deferred People search', async () => {
    const res = await request(app).get('/dig');

    expect(res.status).toBe(200);
    expect(res.text).toContain('class="dig-sidebar"');
    expect(res.text).toContain('id="dig-sidebar-drawer" aria-label="Dig sidebar"');
    expect(res.text).not.toContain('tab-people');
    expect(res.text).not.toContain('panel-people');
    expect(res.text).not.toContain('href="/people"');
    expect(res.text).not.toContain('/api/people-search');
    expect(res.text).not.toContain('/api/people-suggestions');
    expect(res.text).not.toContain('browse-catalogue-explorer');
    expect(res.text).not.toContain('browse-explorer-layout');
    expect(res.text).toContain('/js/dig-sidebar.js');
    expect(res.text).toContain('/css/browse-dig-controls.css');
    expect(res.text).toMatch(/class="[^"]*\bdig-filter-form\b[^"]*"/);
    expect(res.text).not.toContain('dig-crate-filter-form');
    expect(res.text).not.toContain('data-dig-filter-dialog');
    expect(res.text).not.toContain('data-dig-filter-open');
    expect((res.text.match(/class="[^"]*\bdig-filter-form\b[^"]*"/g) || []).length).toBe(1);
    expect(res.text).toContain('id="dig-filter-query" name="q"');
  });

  it('keeps the historical /browse/dig URL on the canonical responsive sidebar', async () => {
    const res = await request(app).get('/browse/dig?genre=Electronic&style=House');

    expect(res.status).toBe(200);
    expect(res.text).toContain('class="dig-sidebar"');
    expect(res.text).toContain('/js/dig-sidebar.js');
    expect(res.text).toContain('value="House" selected');
    expect(res.text).toContain('>White label</button>');
    expect(listingService.hasExplicitWhiteLabelInventory).toHaveBeenCalledTimes(1);
    expect(listingService.searchDigListings).toHaveBeenCalledWith(
      expect.objectContaining({ genre: 'Electronic', style: 'House' })
    );
  });

  it('preserves catalogue artwork as the image fallback when a seller photo fails', async () => {
    const catalogueFallback = 'https://images.example/catalogue-cover.webp';
    (listingService.searchDigListings as jest.Mock).mockResolvedValueOnce({
      items: [{
        id: 'physical-copy-with-fallback',
        title: 'Physical Copy',
        artist: 'Test Artist',
        releaseYear: 1992,
        format: '12-inch',
        priceFormatted: '€20.00',
        isTrade: false,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
        sellerUsername: 'crate_digger',
        sellerLocation: 'Amsterdam',
        url: '/listings/physical-copy-with-fallback',
        imageUrl: '/uploads/physical-front.webp',
        fallbackImageUrl: catalogueFallback,
        imageAlt: 'Front-cover photo of the physical copy',
        frontArtwork: {
          src: '/uploads/physical-front.webp',
          altText: 'Seller photo of the physical front',
          sourceLabel: 'Seller photo',
          sourceKind: 'listing',
        },
        backArtwork: null,
        conditionSummary: 'Media VG+ · hoes VG',
      }],
      totalCount: 1,
      hasMore: false,
    });

    const res = await request(app).get('/dig');

    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-artwork-fallback="${catalogueFallback}"`);
  });

  it('renders style options on invalid filter submissions so the selected House filter can be corrected', async () => {
    const res = await request(app).get('/dig?style=House&minPrice=not-a-price');

    expect(res.status).toBe(400);
    expect(res.text).toContain('value="House" selected');
    expect(res.text).toContain('value="House"');
  });

  it('preserves query and filter parameters in the shareable URL and links', async () => {
    (listingService.searchDigListings as jest.Mock).mockResolvedValueOnce({
      items: [{
        id: 'item-1',
        title: 'Acid Tracks',
        artist: 'Phuture',
        releaseYear: 1987,
        format: '12-inch',
        priceFormatted: '€30.00',
        isTrade: false,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
        sellerUsername: 'house_head',
        sellerLocation: 'Chicago',
        url: '/listings/item-1',
        imageUrl: '/assets/vinyl-placeholder.svg',
        frontArtwork: {
          src: '/assets/vinyl-placeholder.svg',
          altText: 'Acid Tracks front',
          sourceLabel: 'Placeholder',
          sourceKind: 'placeholder',
        },
        backArtwork: null,
        conditionSummary: 'Media VG+ · Sleeve VG',
      }],
      totalCount: 25,
      hasMore: false,
    });
    (listingService.searchBrowseListings as jest.Mock).mockResolvedValueOnce({
      items: [{
        id: 'item-1',
        title: 'Acid Tracks',
        artist: 'Phuture',
        releaseYear: 1987,
        format: '12-inch',
        priceFormatted: '€30.00',
        isTrade: false,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
        sellerUsername: 'house_head',
        sellerLocation: 'Chicago',
        url: '/listings/item-1',
        imageUrl: '/assets/vinyl-placeholder.svg',
      }],
      totalCount: 25,
      page: 2,
      limit: 12,
      totalPages: 3,
    });
    const res = await request(app).get(
      '/dig?q=Phuture&genre=Electronic&style=House&condition=VG%2B&minPrice=10.00&maxPrice=50.00&sort=price_asc&format=12-inch&whiteLabel=1&view=grid&page=2'
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('value="Phuture"');
    expect(res.text).toContain('value="Electronic"');
    expect(res.text).toContain('value="House"');
    expect(res.text).toContain('value="price_asc"');
    expect(res.text).toContain('value="12-inch"');
    expect(listingService.searchDigListings).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'Phuture',
        genre: 'Electronic',
        style: 'House',
        condition: 'VG+',
        minPrice: 1000,
        maxPrice: 5000,
        formats: ['12-inch'],
        whiteLabel: true,
        sort: 'price_asc',
      })
    );

    const hrefFor = (ariaLabel: string): string => {
      const labelPosition = res.text.indexOf('aria-label="' + ariaLabel + '"');
      const anchorStart = res.text.lastIndexOf('<a ', labelPosition);
      const anchorEnd = res.text.indexOf('>', labelPosition);
      const anchor = anchorStart >= 0 && anchorEnd >= 0
        ? res.text.slice(anchorStart, anchorEnd + 1)
        : '';
      const href = anchor.match(/href="([^"]+)"/)?.[1];
      if (!href) throw new Error('Missing ' + ariaLabel + ' link');
      return href.replace(/&amp;/g, '&');
    };
    const assertPreserved = (href: string, expectedView: string, expectedPage: string): void => {
      const params = new URL(href, 'http://localhost').searchParams;
      expect(params.get('q')).toBe('Phuture');
      expect(params.get('genre')).toBe('Electronic');
      expect(params.get('style')).toBe('House');
      expect(params.get('condition')).toBe('VG+');
      expect(params.get('minPrice')).toBe('10.00');
      expect(params.get('maxPrice')).toBe('50.00');
      expect(params.get('sort')).toBe('price_asc');
      expect(params.getAll('format')).toEqual(['12-inch']);
      expect(params.get('whiteLabel')).toBe('1');
      expect(params.get('view')).toBe(expectedView);
      expect(params.get('page')).toBe(expectedPage);
    };

    assertPreserved(hrefFor('Grid view'), 'grid', '2');
    assertPreserved(hrefFor('List view'), 'list', '2');

    const paginationStart = res.text.indexOf('<nav class="pagination-nav browse-pagination"');
    const paginationEnd = res.text.indexOf('</nav>', paginationStart);
    const pagination = paginationStart >= 0 && paginationEnd >= 0
      ? res.text.slice(paginationStart, paginationEnd)
      : '';
    const paginationHref = (label: string): string | undefined => {
      const labelPosition = pagination.indexOf(label);
      const anchorStart = pagination.lastIndexOf('<a ', labelPosition);
      const anchorEnd = pagination.indexOf('>', labelPosition);
      const anchor = anchorStart >= 0 && anchorEnd >= 0
        ? pagination.slice(anchorStart, anchorEnd + 1)
        : '';
      return anchor.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    };
    const previousHref = paginationHref('← Previous');
    const nextHref = paginationHref('Next →');
    expect(previousHref).toBeTruthy();
    expect(nextHref).toBeTruthy();
    assertPreserved(previousHref!, 'grid', '1');
    assertPreserved(nextHref!, 'grid', '3');
  });
});
