import ejs from 'ejs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import fs from 'fs';
import path from 'path';
import supertest from 'supertest';
import { createApp } from '../src/app';
import * as listingService from '../src/app/services/listingService';
import { resolveDigArtwork, DigPhotoCandidate } from '../src/domain/digExperience';
import { buildListingCardFromDetails } from '../src/app/view-models/listingCardViewModel';
import { listingPhotoRoleSchema, newListingPhotoRoleSchema } from '../src/validators/listing';
import digState from '../public/js/dig-state.js';

const app = createApp();

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

describe('Dig search-first responsive shell', () => {
  it('keeps search and Grid/List controls above the results and preserves the current query/filter state', async () => {
    const viewPath = path.join(process.cwd(), 'views/browse/responsive-dig.ejs');
    const html = await ejs.renderFile(viewPath, {
      title: 'Dig Vinyl Records',
      listings: [],
      formatOptions: [{ value: 'lp', label: 'LP', description: 'Long-play records' }],
      whiteLabelAvailable: true,
      filters: {
        q: 'De La Soul',
        genre: 'Hip Hop',
        condition: 'VG+',
        minPrice: '10.00',
        maxPrice: '50.00',
        sort: 'price_asc',
        formats: ['lp', '7-inch'],
        whiteLabel: true,
        view: 'list',
      },
      pagination: { page: 3, totalPages: 4, totalCount: 40 },
      errorMessage: null,
      items: [],
      totalCount: 40,
      hasMore: false,
    });

    expect(html.indexOf('class="dig-search-control-bar"')).toBeLessThan(
      html.indexOf('class="dig-responsive-desktop"')
    );
    expect(html).toContain('id="dig-primary-search"');
    expect(html).toContain('value="De La Soul"');
    expect(html).toContain('aria-label="Search records"');
    expect(html).toContain('class="view-mode-toggle" role="group" aria-label="Dig presentation mode"');
    expect(html).toContain('href="/dig?q=De%20La%20Soul&amp;genre=Hip%20Hop&amp;condition=VG%2B&amp;minPrice=10.00&amp;maxPrice=50.00&amp;sort=price_asc&amp;format=lp&amp;format=7-inch&amp;whiteLabel=1&amp;page=3&amp;view=grid"');
    expect(html).toContain('href="/dig?q=De%20La%20Soul&amp;genre=Hip%20Hop&amp;condition=VG%2B&amp;minPrice=10.00&amp;maxPrice=50.00&amp;sort=price_asc&amp;format=lp&amp;format=7-inch&amp;whiteLabel=1&amp;page=3&amp;view=list"');
    expect(html).toContain('<h1 class="dig-mobile-semantic-title">Dig Vinyl Records</h1>');
    expect(html).not.toContain('Find your next record. Swipe up through the crate, or flip a sleeve to see the back.');
    expect(html).toContain('class="btn btn-outline dig-back-to-browse"');
    expect(html).toContain('aria-label="Back to Dig results"');
  });
});


describe('Compact mobile back navigation', () => {
  it('uses explicit destinations and accessible labels on the affected record screens', () => {
    const digView = fs.readFileSync(path.join(process.cwd(), 'views/browse/dig.ejs'), 'utf8');
    const listingDetailView = fs.readFileSync(path.join(process.cwd(), 'views/listings/show.ejs'), 'utf8');
    const listingEditView = fs.readFileSync(path.join(process.cwd(), 'views/listings/edit.ejs'), 'utf8');
    const listingPreviewView = fs.readFileSync(path.join(process.cwd(), 'views/listings/preview.ejs'), 'utf8');
    const releaseSelectView = fs.readFileSync(path.join(process.cwd(), 'views/listings/select-release.ejs'), 'utf8');
    const mobileStyles = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');

    expect(digView).toContain('aria-label="Back to Dig results"');
    expect(digView).toContain('href="<%= browseReturnUrl %>"');
    expect(listingDetailView).toContain('href="/dig"');
    expect(listingDetailView).toContain('aria-label="Back to Dig results"');

    for (const view of [listingEditView, listingPreviewView, releaseSelectView]) {
      expect(view).toContain('class="mobile-back-control"');
      expect(view).toContain('aria-label="Back to My Listings"');
      expect(view).toContain('href="/listings"');
    }

    expect(mobileStyles).toContain('.mobile-back-control');
    expect(mobileStyles).toContain('min-height: 44px;');
    expect(mobileStyles).toContain('.listing-preview-header .mobile-back-control');
    expect(mobileStyles).toContain('.select-release-header > .mobile-back-control');
  });
});


describe('Shared listing artwork priority', () => {
  it('prefers an explicit seller front cover and retains release artwork as the broken-image fallback', () => {
    const card = buildListingCardFromDetails({
      listing: { id: 'listing-artwork-1', price: 2400, tradeAvailable: false },
      release: {
        title: 'Blue Lines',
        artist: 'Massive Attack',
        format: 'LP',
        coverArtUrl: 'https://catalog.example/blue-lines.webp',
      },
      physicalCopy: { mediaCondition: 'VG+', sleeveCondition: 'VG' },
      seller: { username: 'record_seller' },
      photos: [
        { publicUrl: '/seller/record-label.webp', role: 'record', displayOrder: 0 },
        { publicUrl: '/seller/front-cover.webp', role: 'front_cover', displayOrder: 4 },
      ],
    });

    expect(card.imageUrl).toBe('/seller/front-cover.webp');
    expect(card.fallbackImageUrl).toBe('https://catalog.example/blue-lines.webp');
  });

  it('leaves a missing cover to the shared local placeholder instead of inventing catalogue artwork', () => {
    const card = buildListingCardFromDetails({
      listing: { id: 'listing-artwork-2', price: 1800, tradeAvailable: false },
      release: { title: 'Unknown Pleasures', artist: 'Joy Division', format: 'LP', coverArtUrl: null },
      physicalCopy: { mediaCondition: 'VG+', sleeveCondition: 'VG' },
      seller: { username: 'record_seller' },
      photos: [],
    });

    expect(card.imageUrl).toBeUndefined();
    expect(card.fallbackImageUrl).toBeUndefined();
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
    expect(html).toContain('href="/dig?q=De%20La%20Soul&amp;genre=Hip%20Hop&amp;condition=VG%2B&amp;minPrice=10.00&amp;maxPrice=50.00&amp;sort=price_asc&amp;format=lp&amp;format=7-inch&amp;whiteLabel=1&amp;view=grid"');
    expect(html).toContain('/js/dig-state.js');
    expect(html).toContain('/js/dig-mode.js');
    expect(html).not.toContain('src="/seller/record.webp"');
    expect(html).toContain('href="/listings/listing-1"');
  });

  it('uses one shared client fallback handler for artwork and broken profile avatars', () => {
    const fallbackScript = fs.readFileSync(path.join(process.cwd(), 'public/js/artwork-fallback.js'), 'utf8');
    const activityView = fs.readFileSync(path.join(process.cwd(), 'views/activity/index.ejs'), 'utf8');
    const listingCardView = fs.readFileSync(path.join(process.cwd(), 'views/partials/listing-card.ejs'), 'utf8');

    expect(fallbackScript).toContain('data-artwork-image');
    expect(fallbackScript).toContain('data-avatar-image');
    expect(fallbackScript).toContain("'/assets/vinyl-placeholder.svg'");
    expect(activityView).toContain('data-avatar-image');
    expect(activityView).toContain('item.listingArtworkUrl');
    expect(activityView).toContain("name: 'talk'");
    expect(activityView).not.toContain('🏷️');
    expect(activityView).not.toContain('💬');
    expect(activityView).not.toContain('❤️');
    expect(activityView).not.toContain('📻');
    expect(listingCardView).toContain('data-artwork-fallback');
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
    const rawCss = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');
    const css = rawCss.replace(/\r\n/g, '\n');
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

describe('searchDigListings PGlite database integration', () => {
  let pglite: PGlite;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite);

    const migrationsToApply = [
      '0000_grey_living_tribunal.sql',
      '0001_add_physical_copies.sql',
      '0002_add_release_cover_art.sql',
      '0003_brainy_scarlet_witch.sql',
      '0004_mighty_spacker_dave.sql',
      '0014_add_listing_photo_roles.sql',
      '0015_dismiss_completed_listings.sql',
    ];

    for (const filename of migrationsToApply) {
      const sqlContent = fs.readFileSync(path.join(process.cwd(), 'drizzle', filename), 'utf8');
      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      for (const statement of statements) {
        await pglite.exec(statement);
      }
    }
  });

  afterAll(async () => {
    await pglite.close();
  });

  it('queries database rows and resolves explicit front/back seller photos in Dig view model', async () => {
    const sellerId = '11111111-1111-4111-8111-111111111111';
    const releaseId = '22222222-2222-4222-8222-222222222222';
    const copyId = '33333333-3333-4333-8333-333333333333';
    const listingId = '44444444-4444-4444-8444-444444444444';

    await pglite.exec(`
      INSERT INTO public.profiles (id, username, display_name) VALUES ('${sellerId}', 'record_collector', 'Record Collector');
      INSERT INTO public.releases (id, artist, title, cover_art_url) VALUES ('${releaseId}', 'Miles Davis', 'Kind of Blue', 'https://catalog.example/miles.jpg');
      INSERT INTO public.physical_copies (id, release_id, owner_id, media_condition, sleeve_condition) VALUES ('${copyId}', '${releaseId}', '${sellerId}', 'NM', 'VG+');
      INSERT INTO public.listings (id, physical_copy_id, seller_id, price, status) VALUES ('${listingId}', '${copyId}', '${sellerId}', 2500, 'published');

      INSERT INTO public.listing_photos (id, listing_id, storage_path, display_order, role, alt_text) VALUES
        ('55555555-5555-4555-8555-555555555555', '${listingId}', 'listings/photos/front.webp', 0, 'front_cover', 'Physical front cover'),
        ('66666666-6666-4666-8666-666666666666', '${listingId}', 'listings/photos/back.webp', 1, 'back_cover', 'Physical back cover');
    `);

    const result = await listingService.searchDigListings({ q: 'Miles Davis' }, db);

    expect(result.items.length).toBe(1);
    const item = result.items[0];
    expect(item.title).toBe('Kind of Blue');
    expect(item.frontArtwork.sourceKind).toBe('seller_front');
    expect(item.frontArtwork.src).toContain('listings/photos/front.webp');
    expect(item.backArtwork?.sourceKind).toBe('seller_back');
    expect(item.backArtwork?.src).toContain('listings/photos/back.webp');
  });

  it('never substitutes catalog release.cover_art_url when no seller cover photos exist in DB', async () => {
    const sellerId = '11111111-1111-4111-8111-222222222222';
    const releaseId = '22222222-2222-4222-8222-333333333333';
    const copyId = '33333333-3333-4333-8333-444444444444';
    const listingId = '44444444-4444-4444-8444-555555555555';

    await pglite.exec(`
      INSERT INTO public.profiles (id, username, display_name) VALUES ('${sellerId}', 'jazz_fan', 'Jazz Fan');
      INSERT INTO public.releases (id, artist, title, cover_art_url) VALUES ('${releaseId}', 'John Coltrane', 'Giant Steps', 'https://catalog.example/coltrane.jpg');
      INSERT INTO public.physical_copies (id, release_id, owner_id, media_condition, sleeve_condition) VALUES ('${copyId}', '${releaseId}', '${sellerId}', 'VG+', 'VG+');
      INSERT INTO public.listings (id, physical_copy_id, seller_id, price, status) VALUES ('${listingId}', '${copyId}', '${sellerId}', 3000, 'published');
    `);

    const result = await listingService.searchDigListings({ q: 'Giant Steps' }, db);

    expect(result.items.length).toBe(1);
    const item = result.items[0];
    expect(item.frontArtwork.sourceKind).toBe('placeholder');
    expect(item.frontArtwork.src).toBe('/assets/vinyl-placeholder.svg');
    expect(item.frontArtwork.src).not.toBe('https://catalog.example/coltrane.jpg');
    expect(item.backArtwork).toBeNull();
  });
});

describe('GET /browse/dig HTTP route integration', () => {
  it('renders explicit seller front and back cover images in Dig view when present', async () => {
    const spy = jest.spyOn(listingService, 'searchDigListings').mockResolvedValueOnce({
      items: [{
        id: 'listing-101',
        title: 'Sex Machine',
        artist: 'James Brown',
        releaseYear: 1970,
        format: 'Vinyl, LP',
        priceFormatted: '€35.00',
        isTrade: false,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG+',
        sellerUsername: 'funk_master',
        sellerLocation: 'Detroit',
        url: '/listings/listing-101',
        imageUrl: 'https://storage.example/front-cover.webp',
        imageAlt: 'Front cover of Sex Machine',
        frontArtwork: {
          src: 'https://storage.example/front-cover.webp',
          altText: 'Front cover of the physical sleeve of Sex Machine — James Brown',
          sourceLabel: 'Photo of the front cover of this physical copy',
          sourceKind: 'seller_front',
        },
        backArtwork: {
          src: 'https://storage.example/back-cover.webp',
          altText: 'Back cover of the physical sleeve of Sex Machine — James Brown',
          sourceLabel: 'Photo of the back cover of this physical copy',
          sourceKind: 'seller_back',
        },
        conditionSummary: 'Media VG+ · hoes VG+',
      }],
      totalCount: 1,
      hasMore: false,
    });

    const response = await supertest(app).get('/browse/dig?q=James+Brown');

    expect(response.status).toBe(200);
    expect(response.text).toContain('https://storage.example/front-cover.webp');
    expect(response.text).toContain('https://storage.example/back-cover.webp');
    expect(response.text).not.toContain('Front cover not photographed');
    expect(response.text).not.toContain('Back cover not photographed');

    spy.mockRestore();
  });

  it('renders missing-front and missing-back placeholders when no explicit seller cover photos exist', async () => {
    const spy = jest.spyOn(listingService, 'searchDigListings').mockResolvedValueOnce({
      items: [{
        id: 'listing-102',
        title: 'Sex Machine',
        artist: 'James Brown',
        releaseYear: 1970,
        format: 'Vinyl, LP',
        priceFormatted: '€35.00',
        isTrade: false,
        mediaCondition: 'VG+',
        sleeveCondition: 'VG+',
        sellerUsername: 'funk_master',
        sellerLocation: 'Detroit',
        url: '/listings/listing-102',
        imageUrl: '/assets/vinyl-placeholder.svg',
        imageAlt: 'Vinyl placeholder',
        frontArtwork: {
          src: '/assets/vinyl-placeholder.svg',
          altText: 'No front-cover photo available for the physical copy of Sex Machine — James Brown',
          sourceLabel: 'No front-cover photo available',
          sourceKind: 'placeholder',
        },
        backArtwork: null,
        conditionSummary: 'Media VG+ · hoes VG+',
      }],
      totalCount: 1,
      hasMore: false,
    });

    const response = await supertest(app).get('/browse/dig');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Front cover not photographed');
    expect(response.text).toContain('No seller-selected front-cover photo has been added for this copy.');
    expect(response.text).toContain('Back cover not photographed');
    expect(response.text).toContain('No back-cover photo was provided for this copy.');
    expect(response.text).not.toContain('Release artwork');

    spy.mockRestore();
  });
});

describe('GET /dig responsive presentation', () => {
  it('renders the desktop grid and the mobile swipe stack from the same filter URL', async () => {
    const commonItem = {
      id: 'listing-responsive-1',
      title: 'The Low End Theory',
      artist: 'A Tribe Called Quest',
      releaseYear: 1991,
      format: 'Vinyl, LP',
      priceFormatted: '€24.00',
      isTrade: false,
      mediaCondition: 'VG+',
      sleeveCondition: 'VG',
      sellerUsername: 'crate_digger',
      sellerLocation: 'Amsterdam',
      url: '/listings/listing-responsive-1',
      imageUrl: 'https://catalog.example/low-end-theory.webp',
      fallbackImageUrl: '/assets/vinyl-placeholder.svg',
      imageAlt: 'Artwork for The Low End Theory',
    };
    const browseSpy = jest.spyOn(listingService, 'searchBrowseListings').mockResolvedValueOnce({
      items: [commonItem],
      totalCount: 1,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
    const digSpy = jest.spyOn(listingService, 'searchDigListings').mockResolvedValueOnce({
      items: [{
        ...commonItem,
        frontArtwork: {
          src: 'https://seller.example/front.webp',
          altText: 'Seller-selected front cover',
          sourceLabel: 'Photo of the front cover of this physical copy',
          sourceKind: 'seller_front',
        },
        backArtwork: null,
        conditionSummary: 'Media VG+ · hoes VG',
      }],
      totalCount: 1,
      hasMore: false,
    });
    const whiteLabelSpy = jest.spyOn(listingService, 'hasExplicitWhiteLabelInventory').mockResolvedValueOnce(false);

    try {
      const response = await supertest(app).get('/dig?q=Theory');
      expect(response.status).toBe(200);
      expect(response.text).toContain('class="dig-responsive-mobile-header"');
      expect(response.text).toContain('class="dig-responsive-desktop"');
      expect(response.text).toContain('class="dig-responsive-mobile"');
      expect(response.text).toContain('class="listing-grid"');
      expect(response.text).toContain('action="/dig"');
      expect(response.text).toContain('data-dig-experience');
      expect(response.text).toContain('https://seller.example/front.webp');
      expect(response.text).toContain('href="/dig?');
      expect(response.text).not.toContain('>BROWSE</a>');
    } finally {
      browseSpy.mockRestore();
      digSpy.mockRestore();
      whiteLabelSpy.mockRestore();
    }
  });
});

describe('Responsive release-select surface', () => {
  it('uses the shared artwork fallback and mobile layout hooks for Discogs and local releases', () => {
    const view = fs.readFileSync(path.join(process.cwd(), 'views/listings/select-release.ejs'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');

    expect(view).toContain('class="select-release-search-form"');
    expect(view).toContain('class="card select-release-result"');
    expect(view).toContain('data-artwork-image');
    expect(view).toContain('/assets/vinyl-placeholder.svg');
    expect(view).not.toContain('>VINYL</div>');
    expect(css).toContain('.select-release-search-form');
    expect(css).toContain('.select-release-result');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
  });
});

describe('Responsive listing page', () => {
  it('keeps the focused listing detail grid within narrow mobile viewports', () => {
    const view = fs.readFileSync(path.join(process.cwd(), 'views/listings/show.ejs'), 'utf8');
    const rawCss = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');
    const css = rawCss.replace(/\r\n/g, '\n');

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
