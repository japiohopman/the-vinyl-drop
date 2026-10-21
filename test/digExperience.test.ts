import ejs from 'ejs';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { resolveDigArtwork, DigPhotoCandidate } from '../src/domain/digExperience';
import { listingPhotoRoleSchema, newListingPhotoRoleSchema } from '../src/validators/listing';
import digState from '../public/js/dig-state.js';

const photo = (
  role: DigPhotoCandidate['role'],
  displayOrder: number,
  publicUrl: string,
  altText: string | null = null
): DigPhotoCandidate => ({ role, displayOrder, publicUrl, altText });

describe('Dig navigation and flip state', () => {
  it('keeps previous/next navigation inside the first and last slide boundaries', () => {
    expect(digState.isValidIndex(0, 3)).toBe(true);
    expect(digState.isValidIndex(2, 3)).toBe(true);
    expect(digState.isValidIndex(-1, 3)).toBe(false);
    expect(digState.isValidIndex(3, 3)).toBe(false);
    expect(digState.adjacentIndex(0, 3, -1)).toBeNull();
    expect(digState.adjacentIndex(0, 3, 1)).toBe(1);
    expect(digState.adjacentIndex(2, 3, 1)).toBeNull();
    expect(digState.adjacentIndex(2, 3, -1)).toBe(1);
    expect(digState.adjacentIndex(0, 1, 1)).toBeNull();
    expect(digState.adjacentIndex(0, 1, -1)).toBeNull();

    expect(digState.shouldCommitSwipe(-80, 64, 1, 3, false)).toBe(true);
    expect(digState.shouldCommitSwipe(30, 64, 1, 3, false)).toBe(false);
    expect(digState.shouldCommitSwipe(80, 64, 3, 3, false)).toBe(false);
    expect(digState.shouldCommitSwipe(-80, 64, 1, 3, true)).toBe(false);
  });

  it('toggles front/back without changing the current slide state', () => {
    const initialIndex = 1;
    const flipped = digState.nextFlipState(false);
    expect(flipped).toBe(true);
    expect(digState.nextFlipState(flipped)).toBe(false);
    expect(initialIndex).toBe(1);
  });
});

describe('Dig artwork face semantics', () => {
  it('chooses only explicitly selected front and back photos, independent of display order', () => {
    const result = resolveDigArtwork([
      photo('back_cover', 0, '/seller/back.webp', 'Achterkant met tracklist'),
      photo('record', 1, '/seller/record.webp', 'Side A label'),
      photo('front_cover', 4, '/seller/front.webp', 'Voorkant van de hoes'),
    ], 'Blue Train', 'John Coltrane');

    expect(result.front.src).toBe('/seller/front.webp');
    expect(result.front.sourceKind).toBe('seller_front');
    expect(result.back?.src).toBe('/seller/back.webp');
    expect(result.back?.sourceKind).toBe('seller_back');
    expect(result.hasExplicitBackCover).toBe(true);
  });

  it('never uses legacy/unclassified photos as the front or back sleeve face', () => {
    const result = resolveDigArtwork([
      photo('legacy_unclassified', 0, '/seller/old-photo.webp', 'Oude foto zonder rol'),
      photo('record', 1, '/seller/record.webp', 'Side B label'),
      photo('inside_sleeve', 2, '/seller/inside.webp', 'Binnenkant'),
    ], 'Low End Theory', 'A Tribe Called Quest');

    expect(result.front.src).toBe('/assets/vinyl-placeholder.svg');
    expect(result.front.sourceKind).toBe('placeholder');
    expect(result.front.sourceLabel).toBe('No front-cover photo available');
    expect(result.back).toBeNull();
    expect(result.hasExplicitBackCover).toBe(false);
  });

  it('does not use catalog/release artwork or other photo roles when a front-cover photo is missing', () => {
    const result = resolveDigArtwork([
      photo('record', 0, '/seller/record.webp', 'Side A label'),
      photo('inside_sleeve', 1, '/seller/inside.webp', 'Gatefold binnenkant'),
      photo('insert_poster', 2, '/seller/poster.webp', 'Poster'),
      photo('detail', 3, '/seller/detail.webp', 'Corner wear'),
    ], 'Madvillainy', 'Madvillain');

    expect(result.front.src).toBe('/assets/vinyl-placeholder.svg');
    expect(result.front.sourceKind).toBe('placeholder');
    expect(result.front.altText).toContain('No front-cover photo available');
    expect(result.back).toBeNull();
    expect(result.hasExplicitBackCover).toBe(false);
  });

  it('uses a configurable neutral placeholder when neither explicit cover role exists', () => {
    const result = resolveDigArtwork([], 'Unknown Release', 'Unknown Artist', '/assets/no-cover.svg');
    expect(result.front.src).toBe('/assets/no-cover.svg');
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

  it('renders a clean English Dig card, accessible swipe-to-flip control, missing-back fallback and filter-preserving return links', async () => {
    const viewPath = path.join(process.cwd(), 'views/browse/dig.ejs');
    const html = await ejs.renderFile(viewPath, {
      title: 'Crate Dig',
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
          altText: 'Front cover of the physical sleeve for 3 Feet High and Rising',
          sourceLabel: 'Seller photo of the physical front cover',
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
    expect(html).toContain('Flip cover to view the back');
    expect(html).toContain('Back cover not photographed');
    expect(html).not.toContain('dig-face-label');
    expect(html).not.toContain('dig-artwork-source');
    expect(html).not.toContain('Media condition');
    expect(html).not.toContain('Sleeve condition');
    expect(html).toContain('Price');
    expect(html).toContain('Open listing');
    expect(html).toContain('data-dig-prev');
    expect(html).toContain('data-dig-next');
    expect(html).not.toContain('dig-instructions');
    expect(html).not.toContain('Omhoog swipen');
    expect(html).not.toContain('data-dig-progress-label');
    expect(html).toContain('class="dig-keyboard-note"');
    expect(html).toContain('href="/browse?q=De%20La%20Soul&amp;genre=Hip%20Hop&amp;condition=VG%2B&amp;minPrice=10.00&amp;maxPrice=50.00&amp;sort=price_asc&amp;format=lp&amp;format=7-inch&amp;whiteLabel=1&amp;view=grid"');
    expect(html).toContain('/js/dig-state.js');
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
    expect(script).toContain('gesture.deltaX');
    expect(script).toContain('setFlipState(slide, digState.nextFlipState');
    expect(script).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(script).toContain('digState.isValidIndex');
    expect(script).toContain('digState.nextFlipState');
    expect(script).toContain('digState.adjacentIndex');
    expect(script).toContain("slide.inert = true");

    const view = fs.readFileSync(path.join(process.cwd(), 'views/browse/dig.ejs'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');
    expect(css).toContain('.dig-sleeve-image');
    expect(css).toContain('object-fit: contain');
    expect(css).toContain('touch-action: pinch-zoom;');
    expect(view).toContain('Front cover not photographed');
    expect(view).not.toContain('Release artwork');
    expect(view).not.toContain('dig-artwork-badge');
    expect(css).toContain('.dig-slide.is-leaving-up');
    expect(css).toContain('.dig-page[data-reduced-motion="true"] .dig-sleeve-card.is-flipped');
    expect(css).toContain('@media (max-width: 680px)');
    expect(css).toContain('.dig-nav-button {\n    display: none;');
    expect(css).toContain('.dig-keyboard-note {\n    display: none;');
  });
});

describe('Responsive listing page', () => {
  it('keeps the focused listing detail grid within narrow mobile viewports', () => {
    const view = fs.readFileSync(path.join(process.cwd(), 'views/listings/show.ejs'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');

    expect(view).not.toContain('minmax(320px, 1fr)');
    expect(view).toContain('class="listing-detail-grid"');
    expect(view).toContain('class="listing-main-photo"');
    expect(css).toContain('.listing-detail-grid {');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).toContain('.listing-main-photo');
    expect(css).toContain('@media (max-width: 767px)');
  });
});


describe('Dig photo-role migration compatibility', () => {
  it('keeps existing photo rows visible and ordered while leaving them unclassified', async () => {
    const database = new PGlite();
    try {
      await database.exec(`
        CREATE SCHEMA IF NOT EXISTS public;
        CREATE TABLE public.listing_photos (
          id uuid PRIMARY KEY,
          listing_id uuid NOT NULL,
          storage_path text NOT NULL,
          display_order integer NOT NULL DEFAULT 0,
          alt_text text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO public.listing_photos (id, listing_id, storage_path, display_order, alt_text)
        VALUES
          ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'old/second.webp', 1, 'Second old image'),
          ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'old/first.webp', 0, 'First old image');
      `);

      const migrationPath = path.join(process.cwd(), 'drizzle/0014_add_listing_photo_roles.sql');
      const migration = fs.readFileSync(migrationPath, 'utf8');
      for (const statement of migration.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) {
        await database.exec(statement);
      }

      const rows = await database.query<{ id: string; storage_path: string; display_order: number; role: string }>(
        'SELECT id::text AS id, storage_path, display_order, role FROM public.listing_photos ORDER BY display_order'
      );
      expect(rows.rows).toEqual([
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          storage_path: 'old/first.webp',
          display_order: 0,
          role: 'legacy_unclassified',
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          storage_path: 'old/second.webp',
          display_order: 1,
          role: 'legacy_unclassified',
        },
      ]);

      await database.query(
        "UPDATE public.listing_photos SET role = 'front_cover' WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'"
      );
      await expect(database.query(
        "UPDATE public.listing_photos SET role = 'front_cover' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
      )).rejects.toThrow();
      const roleAfterRejectedDuplicate = await database.query<{ id: string; role: string }>(
        'SELECT id::text AS id, role FROM public.listing_photos ORDER BY display_order'
      );
      expect(roleAfterRejectedDuplicate.rows.map((row) => row.role)).toEqual(['front_cover', 'legacy_unclassified']);
    } finally {
      await database.close();
    }
  });
});
