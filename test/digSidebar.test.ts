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

  it('renders dedicated Dig sidebar with Records and People tabs and no unstyled Browse explorer', async () => {
    const res = await request(app).get('/dig');

    expect(res.status).toBe(200);
    // Asserts presence of dedicated Dig sidebar
    expect(res.text).toContain('class="dig-sidebar"');
    expect(res.text).toContain('role="tablist" aria-label="Dig sidebar view"');
    expect(res.text).toContain('id="tab-records" aria-selected="true"');
    expect(res.text).toContain('id="tab-people" aria-selected="false"');
    expect(res.text).toContain('id="panel-records" role="tabpanel"');
    expect(res.text).toContain('id="panel-people" role="tabpanel"');

    // Asserts no unstyled Browse catalogue explorer markup is emitted in Dig
    expect(res.text).not.toContain('browse-catalogue-explorer');
    expect(res.text).not.toContain('browse-explorer-layout');

    // Asserts script bundle for dig-sidebar is included
    expect(res.text).toContain('/js/dig-sidebar.js');

    // Asserts stylesheet browse-dig-controls.css is loaded
    expect(res.text).toContain('/css/browse-dig-controls.css');
    expect(res.text).toContain('class="dig-filter-form"');
    expect(res.text).not.toContain('dig-crate-filter-form');
    expect(res.text).not.toContain('data-dig-filter-dialog');
    expect(res.text).not.toContain('data-dig-filter-open');
    expect((res.text.match(/class="dig-filter-form"/g) || []).length).toBe(1);
  });

  it('preserves query and filter parameters in the shareable URL and links', async () => {
    const res = await request(app).get('/dig?q=Phuture&genre=Electronic&style=House&sort=price_asc&format=12-inch');

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
        sort: 'price_asc',
      })
    );
  });
});
