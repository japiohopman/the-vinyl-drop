import path from 'path';
import { readFileSync } from 'fs';
import ejs from 'ejs';
import { formatPrice, buildListingImageAlt, buildListingCardViewModel } from '../src/app/view-models/listingCardViewModel';
import { formatZodFormErrors, demoListingFormSchema } from '../src/app/view-models/formViewModel';

describe('UI Primitives View Models and Helpers', () => {
  describe('ListingCardViewModel Helpers', () => {
    it('should format numeric price in minor units (cents) to Euros with 2 decimal places', () => {
      expect(formatPrice(3500)).toBe('€35.00');
      expect(formatPrice(1250)).toBe('€12.50');
      expect(formatPrice(0)).toBe('€0.00');
    });

    it('should format trade-only or missing prices correctly', () => {
      expect(formatPrice(null, true)).toBe('TRADE ONLY');
      expect(formatPrice(undefined, false)).toBe('TRADE ONLY');
    });

    it('should build screen-reader accessible alt text for listing artwork', () => {
      const altText = buildListingImageAlt('A Love Supreme', 'John Coltrane', '12" LP');
      expect(altText).toBe('Album cover artwork for A Love Supreme by John Coltrane (12" LP)');
    });

    it('should construct complete ListingCardViewModel using builder helper', () => {
      const vm = buildListingCardViewModel({
        id: '123',
        title: 'Kind of Blue',
        artist: 'Miles Davis',
        releaseYear: 1959,
        format: '12" LP',
        priceMinorUnits: 3200,
        mediaCondition: 'NM',
        sleeveCondition: 'VG+',
        sellerUsername: 'miles_ahead',
        sellerLocation: 'Dublin 8'
      });

      expect(vm.priceFormatted).toBe('€32.00');
      expect(vm.imageAlt).toBe('Album cover artwork for Kind of Blue by Miles Davis (12" LP)');
      expect(vm.url).toBe('/listings/123');
    });
  });

  describe('FormViewModel and Zod Error Mapping', () => {
    it('should map Zod validation issues to field-specific error messages', () => {
      const rawValues = {
        title: '',
        artist: 'John Coltrane',
        price: 'invalid-price',
        mediaCondition: 'INVALID_COND',
        description: 'Test',
        acceptTerms: 'off'
      };

      const result = demoListingFormSchema.safeParse(rawValues);

      expect(result.success).toBe(false);
      if (!result.success) {
        const formatted = formatZodFormErrors(result.error, rawValues);
        expect(formatted.fieldErrors.title).toContain('Album title is required');
        expect(formatted.fieldErrors.price).toContain('Price must be a valid number');
        expect(formatted.fieldErrors.mediaCondition).toContain('Please select a valid media condition');
        expect(formatted.fieldErrors.acceptTerms).toContain('You must confirm the listing accuracy');
      }
    });

    it('should validate correct demo form inputs successfully', () => {
      const result = demoListingFormSchema.safeParse({
        title: 'Kind of Blue',
        artist: 'Miles Davis',
        price: '32.00',
        mediaCondition: 'VG+',
        description: 'Great pressing',
        acceptTerms: 'on'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Listing Card Template Rendering', () => {
    const templatePath = path.resolve(__dirname, '../views/partials/listing-card.ejs');

    it('should render grid mode listing card with full square media link and overlay badge container', async () => {
      const html = await ejs.renderFile(templatePath, {
        listing: {
          id: 'test-1',
          title: 'A Love Supreme',
          artist: 'John Coltrane',
          imageUrl: 'https://example.com/cover.jpg',
          mediaCondition: 'NM',
          sleeveCondition: 'VG+',
        },
        mode: 'grid',
      });

      expect(html).toContain('class="listing-card "');
      expect(html).toContain('class="listing-card-media"');
      expect(html).toContain('class="listing-card-image-link"');
      expect(html).toContain('class="listing-card-badge-container"');
      expect(html).toContain('condition-badge-group');
      expect(html).toContain('NM');
      expect(html).toContain('VG+');
    });

    it('should render list mode without badge overlay in media frame', async () => {
      const html = await ejs.renderFile(templatePath, {
        listing: {
          id: 'test-2',
          title: 'Blue Train',
          artist: 'John Coltrane',
          imageUrl: 'https://example.com/blue.jpg',
          mediaCondition: 'M',
          sleeveCondition: 'M',
        },
        mode: 'list',
      });

      expect(html).toContain('listing-card-list-mode');
      expect(html).toContain('class="listing-card-image-link"');
      expect(html).not.toContain('class="listing-card-badge-container"');
      expect(html).toContain('class="listing-card-list-condition"');
    });

    it('should render fallback when imageUrl is missing', async () => {
      const html = await ejs.renderFile(templatePath, {
        listing: {
          id: 'test-3',
          title: 'Giant Steps',
          artist: 'John Coltrane',
          imageUrl: '',
        },
        mode: 'grid',
      });

      expect(html).toContain('src="/assets/vinyl-placeholder.svg"');
      expect(html).toContain('data-artwork-image');
      expect(html).toContain('data-artwork-fallback=""');
      expect(html).not.toContain('class="listing-card-image-fallback"');
    });
  });
});


describe('Compact mobile layout surfaces', () => {
  const footerTemplatePath = path.resolve(__dirname, '../views/partials/footer.ejs');
  const browseTemplatePath = path.resolve(__dirname, '../views/browse/index.ejs');

  it('keeps secondary footer links available in a labelled disclosure', async () => {
    const html = await ejs.renderFile(footerTemplatePath);

    expect(html).toContain('<details class="footer-links-menu">');
    expect(html).toContain('<summary>Info &amp; contact</summary>');
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/community-rules"');
  });

  it('groups browse search and filter controls without dropping existing filter fields', async () => {
    const html = await ejs.renderFile(browseTemplatePath, {
      title: 'Dig Vinyl Records',
      formatOptions: [],
      whiteLabelAvailable: false,
      filters: {
        q: '',
        genre: '',
        condition: '',
        minPrice: '',
        maxPrice: '',
        sort: 'newest',
        formats: [],
        whiteLabel: false,
        view: 'grid',
      },
      listings: [],
      pagination: {
        page: 1,
        totalPages: 1,
        totalCount: 0,
      },
      errorMessage: null,
    });

    expect(html).toContain('class="browse-mobile-filter-panel"');
    expect(html).toContain('class="browse-mobile-filter-summary"');
    expect(html).toContain('Refine your Dig');
    expect(html).toContain('id="search-q"');
    expect(html).toContain('id="filter-genre"');
    expect(html).toContain('id="filter-condition"');
    expect(html).toContain('id="filter-min-price"');
    expect(html).toContain('id="filter-max-price"');
    expect(html).toContain('id="filter-sort"');
    expect(html).toContain('class="browse-filter-actions"');
  });
});


describe('Compact release selection on mobile', () => {
  const templatePath = path.resolve(__dirname, '../views/listings/select-release.ejs');
  const stylesheetPath = path.resolve(__dirname, '../public/css/style.css');

  it('keeps release artwork, metadata, and the selection action in the result template', async () => {
    const html = await ejs.renderFile(templatePath, {
      query: '',
      searchResults: [],
      releases: [{
        id: 'release-1',
        title: 'Kind of Blue',
        artist: 'Miles Davis',
        label: 'Columbia',
        releaseYear: 1959,
        format: '12" LP',
        coverArtUrl: '',
      }],
    });

    expect(html).toContain('class="card select-release-result"');
    expect(html).toContain('class="select-release-result-content"');
    expect(html).toContain('Kind of Blue');
    expect(html).toContain('Select Release');
  });

  it('uses a compact two-column action layout and clamps long release metadata on mobile', () => {
    const stylesheet = readFileSync(stylesheetPath, 'utf8');
    const mobileReleaseStyles = stylesheet.slice(
      stylesheet.lastIndexOf('/* Compact release selection rows on mobile:'),
    );

    expect(mobileReleaseStyles).toContain('@media (max-width: 767px)');
    expect(mobileReleaseStyles).toContain('.select-release-result {');
    expect(mobileReleaseStyles).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(mobileReleaseStyles).toContain('-webkit-line-clamp: 2;');
    expect(mobileReleaseStyles).toContain('.select-release-search-form {');
  });
});
