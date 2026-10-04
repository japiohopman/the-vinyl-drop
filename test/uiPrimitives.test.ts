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
});
