import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { resolveDigArtwork, DigPhotoCandidate } from '../src/domain/digExperience';
import { listingPhotoRoleSchema, newListingPhotoRoleSchema } from '../src/validators/listing';

const photo = (
  role: DigPhotoCandidate['role'],
  displayOrder: number,
  publicUrl: string,
  altText: string | null = null
): DigPhotoCandidate => ({ role, displayOrder, publicUrl, altText });

describe('Dig artwork face semantics', () => {
  it('chooses only explicitly classified sleeve front and back, independently of display order', () => {
    const result = resolveDigArtwork([
      photo('back_cover', 0, '/seller/back.webp', 'Achterkant met tracklist'),
      photo('record', 1, '/seller/record.webp', 'Side A label'),
      photo('front_cover', 4, '/seller/front.webp', 'Voorkant van de hoes'),
    ], '/release/catalogue-art.webp', 'Blue Train', 'John Coltrane');

    expect(result.front.src).toBe('/seller/front.webp');
    expect(result.front.sourceKind).toBe('seller_front');
    expect(result.back?.src).toBe('/seller/back.webp');
    expect(result.back?.sourceKind).toBe('seller_back');
    expect(result.hasExplicitBackCover).toBe(true);
  });

  it('allows the first legacy-unclassified image only as a labelled compatibility front fallback', () => {
    const photos = [
      photo('legacy_unclassified', 0, '/seller/old-photo.webp', 'Oude foto zonder rol'),
      photo('record', 1, '/seller/record.webp', 'Side B label'),
      photo('inside_sleeve', 2, '/seller/inside.webp', 'Binnenkant'),
    ];
    const result = resolveDigArtwork(photos, '/release/catalogue-art.webp', 'Low End Theory', 'A Tribe Called Quest');

    expect(result.front.src).toBe('/seller/old-photo.webp');
    expect(result.front.sourceKind).toBe('legacy_photo');
    expect(result.front.sourceLabel).toContain('nog niet geclassificeerd');
    expect(result.back).toBeNull();
    expect(result.hasExplicitBackCover).toBe(false);
    expect(photos[0].role).toBe('legacy_unclassified');
  });

  it('never substitutes a record, inside sleeve, poster, or release artwork for a missing back cover', () => {
    const result = resolveDigArtwork([
      photo('record', 0, '/seller/record.webp', 'Side A label'),
      photo('inside_sleeve', 1, '/seller/inside.webp', 'Gatefold binnenkant'),
      photo('insert_poster', 2, '/seller/poster.webp', 'Poster'),
    ], '/release/catalogue-art.webp', 'Madvillainy', 'Madvillain');

    expect(result.front.src).toBe('/release/catalogue-art.webp');
    expect(result.front.sourceKind).toBe('release_artwork');
    expect(result.front.sourceLabel).toContain('geen bewijs van de conditie');
    expect(result.back).toBeNull();
    expect(result.hasExplicitBackCover).toBe(false);
  });

  it('uses a clear placeholder when neither a suitable seller image nor release art exists', () => {
    const result = resolveDigArtwork([], null, 'Unknown Release', 'Unknown Artist');
    expect(result.front.src).toBe('/assets/vinyl-placeholder.svg');
    expect(result.front.sourceKind).toBe('placeholder');
    expect(result.back).toBeNull();
  });
});

describe('Dig photo-role contract', () => {
  it('permits legacy roles for existing photos but never offers legacy as a new-upload choice', () => {
    expect(listingPhotoRoleSchema.safeParse('legacy_unclassified').success).toBe(true);
    expect(newListingPhotoRoleSchema.safeParse('legacy_unclassified').success).toBe(false);
    expect(newListingPhotoRoleSchema.safeParse('front_cover').success).toBe(true);
    expect(newListingPhotoRoleSchema.safeParse('back_cover').success).toBe(true);
  });

  it('renders one-listing slides, labeled faces, missing-back fallback, accessible controls and filter-preserving return links', async () => {
    const viewPath = path.join(process.cwd(), 'views/browse/dig.ejs');
    const html = await ejs.renderFile(viewPath, {
      title: 'Crate Dig',
      errorMessage: '',
      hasMore: false,
      totalCount: 1,
      filters: {
        q: 'De La Soul',
        genre: 'Hip Hop',
        condition: 'VG+',
        minPrice: '10.00',
        maxPrice: '50.00',
        sort: 'price_asc',
        formats: ['lp', '7-inch'],
        whiteLabel: true,
        view: 'dig',
      },
      items: [{
        id: 'listing-1',
        title: '3 Feet High and Rising',
        artist: 'De La Soul',
        releaseYear: 1989,
        format: 'Vinyl, LP, Album',
        priceFormatted: '€20.00',
        isTrade: false,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG',
        sellerUsername: 'crate_digger',
        sellerLocation: 'Amsterdam',
        url: '/listings/listing-1',
        frontArtwork: {
          src: '/seller/front.webp',
          altText: 'Voorkant van de fysieke hoes van 3 Feet High and Rising',
          sourceLabel: 'Foto van de voorkant van deze fysieke kopie',
          sourceKind: 'seller_front',
        },
        backArtwork: null,
        conditionSummary: 'Media VG+ · hoes VG',
      }],
    });

    expect(html).toContain('data-dig-experience');
    expect(html).toContain('data-dig-viewer');
    expect(html).toContain('data-dig-slide');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Bekijk achterkant');
    expect(html).toContain('Achterkant niet gefotografeerd');
    expect(html).toContain('Voorkant');
    expect(html).toContain('Achterkant');
    expect(html).toContain('href="/browse?q=De%20La%20Soul&amp;genre=Hip%20Hop&amp;condition=VG%2B&amp;minPrice=10.00&amp;maxPrice=50.00&amp;sort=price_asc&amp;format=lp&amp;format=7-inch&amp;whiteLabel=1&amp;view=grid"');
    expect(html).toContain('/js/dig-mode.js');
    expect(html).not.toContain('src="/seller/record.webp"');
    expect(html).toContain('href="/listings/listing-1"');
  });

  it('ships keyboard, vertical pointer gesture and reduced-motion behavior in the Dig controller', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'public/js/dig-mode.js'), 'utf8');
    expect(script).toContain("event.key === 'ArrowUp'");
    expect(script).toContain("event.key === 'ArrowDown'");
    expect(script).toContain("event.key === 'Home'");
    expect(script).toContain("event.key === 'End'");
    expect(script).toContain("addEventListener('pointerdown'");
    expect(script).toContain("addEventListener('pointermove'");
    expect(script).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(script).toContain("card.classList.toggle('is-flipped')");
    expect(script).toContain("slide.inert = true");

    const css = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');
    expect(css).toContain('.dig-sleeve-image');
    expect(css).toContain('object-fit: contain');
    expect(css).toContain('.dig-slide.is-leaving-up');
    expect(css).toContain('.dig-page[data-reduced-motion="true"] .dig-sleeve-card.is-flipped');
  });
});
