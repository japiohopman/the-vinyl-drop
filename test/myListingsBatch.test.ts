import ejs from 'ejs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { getDb } from '../src/db';
import { getMyListings } from '../src/app/services/listingService';
import { getPhotoPublicUrl } from '../src/app/services/storageService';
import { getIconSvg } from '../src/app/utils/iconRegistry';

const listingsTemplatePath = path.join(__dirname, '../views/listings/index.ejs');

const SELLER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_SELLER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const LISTING_VISIBLE_PHOTO = '30000000-0000-4000-8000-000000000001';
const LISTING_VISIBLE_ART = '30000000-0000-4000-8000-000000000002';
const LISTING_HIDDEN = '30000000-0000-4000-8000-000000000003';
const LISTING_OTHER_SELLER = '30000000-0000-4000-8000-000000000004';

const COPY_VISIBLE_PHOTO = '20000000-0000-4000-8000-000000000001';
const COPY_VISIBLE_ART = '20000000-0000-4000-8000-000000000002';
const COPY_HIDDEN = '20000000-0000-4000-8000-000000000003';
const COPY_OTHER_SELLER = '20000000-0000-4000-8000-000000000004';

const RELEASE_VISIBLE_PHOTO = '10000000-0000-4000-8000-000000000001';
const RELEASE_VISIBLE_ART = '10000000-0000-4000-8000-000000000002';
const RELEASE_HIDDEN = '10000000-0000-4000-8000-000000000003';
const RELEASE_OTHER_SELLER = '10000000-0000-4000-8000-000000000004';

/** Counts Drizzle select-builder invocations without changing the isolated test database behavior. */
function countSelectQueries(database: ReturnType<typeof getDb>): {
  db: ReturnType<typeof getDb>;
  count: () => number;
} {
  let selectCount = 0;
  const countedDb = new Proxy(database as object, {
    get(target, property) {
      if (property === 'select') {
        return (...args: unknown[]) => {
          selectCount += 1;
          const select = Reflect.get(target, property, target) as (...values: unknown[]) => unknown;
          return select.apply(target, args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    db: countedDb as ReturnType<typeof getDb>,
    count: () => selectCount,
  };
}

describe('My Listings batched database reads (#380)', () => {
  let pg: PGlite;
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE public.releases (
        id uuid PRIMARY KEY,
        artist text NOT NULL,
        title text NOT NULL,
        release_year integer,
        cover_art_url text
      );
      CREATE TABLE public.physical_copies (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL,
        media_condition text NOT NULL,
        sleeve_condition text NOT NULL
      );
      CREATE TABLE public.listings (
        id uuid PRIMARY KEY,
        seller_id uuid NOT NULL,
        physical_copy_id uuid NOT NULL,
        status text NOT NULL,
        price integer,
        trade_available boolean NOT NULL,
        dismissed_at timestamptz
      );
      CREATE TABLE public.listing_photos (
        id uuid PRIMARY KEY,
        listing_id uuid NOT NULL,
        storage_path text NOT NULL,
        role text NOT NULL,
        display_order integer NOT NULL,
        alt_text text,
        created_at timestamptz NOT NULL
      );
    `);
    db = drizzle(pg) as unknown as ReturnType<typeof getDb>;

    await pg.query(
      'INSERT INTO public.releases(id, artist, title, release_year, cover_art_url) VALUES ($1, $2, $3, $4, $5)',
      [RELEASE_VISIBLE_PHOTO, 'A Tribe Called Quest', 'The Low End Theory', 1991, 'https://catalog.example/low-end-theory.jpg']
    );
    await pg.query(
      'INSERT INTO public.releases(id, artist, title, release_year, cover_art_url) VALUES ($1, $2, $3, $4, $5)',
      [RELEASE_VISIBLE_ART, 'A Tribe Called Quest', 'Midnight Marauders', 1993, 'https://catalog.example/midnight-marauders.jpg']
    );
    await pg.query(
      'INSERT INTO public.releases(id, artist, title, release_year, cover_art_url) VALUES ($1, $2, $3, $4, $5)',
      [RELEASE_HIDDEN, 'Snoop Dogg', 'Doggystyle', 1993, 'https://catalog.example/doggystyle.jpg']
    );
    await pg.query(
      'INSERT INTO public.releases(id, artist, title, release_year, cover_art_url) VALUES ($1, $2, $3, $4, $5)',
      [RELEASE_OTHER_SELLER, 'Nas', 'Illmatic', 1994, 'https://catalog.example/illmatic.jpg']
    );

    await pg.query(
      'INSERT INTO public.physical_copies(id, release_id, media_condition, sleeve_condition) VALUES ($1, $2, $3, $4)',
      [COPY_VISIBLE_PHOTO, RELEASE_VISIBLE_PHOTO, 'NM', 'VG+']
    );
    await pg.query(
      'INSERT INTO public.physical_copies(id, release_id, media_condition, sleeve_condition) VALUES ($1, $2, $3, $4)',
      [COPY_VISIBLE_ART, RELEASE_VISIBLE_ART, 'VG+', 'VG']
    );
    await pg.query(
      'INSERT INTO public.physical_copies(id, release_id, media_condition, sleeve_condition) VALUES ($1, $2, $3, $4)',
      [COPY_HIDDEN, RELEASE_HIDDEN, 'VG', 'VG-']
    );
    await pg.query(
      'INSERT INTO public.physical_copies(id, release_id, media_condition, sleeve_condition) VALUES ($1, $2, $3, $4)',
      [COPY_OTHER_SELLER, RELEASE_OTHER_SELLER, 'M', 'NM']
    );

    await pg.query(
      'INSERT INTO public.listings(id, seller_id, physical_copy_id, status, price, trade_available, dismissed_at) VALUES ($1, $2, $3, $4, $5, $6, NULL)',
      [LISTING_VISIBLE_PHOTO, SELLER_ID, COPY_VISIBLE_PHOTO, 'draft', 1995, false]
    );
    await pg.query(
      'INSERT INTO public.listings(id, seller_id, physical_copy_id, status, price, trade_available, dismissed_at) VALUES ($1, $2, $3, $4, NULL, true, NULL)',
      [LISTING_VISIBLE_ART, SELLER_ID, COPY_VISIBLE_ART, 'published']
    );
    await pg.query(
      'INSERT INTO public.listings(id, seller_id, physical_copy_id, status, price, trade_available, dismissed_at) VALUES ($1, $2, $3, $4, $5, false, $6)',
      [LISTING_HIDDEN, SELLER_ID, COPY_HIDDEN, 'sold', 1500, '2026-11-06T10:00:00.000Z']
    );
    await pg.query(
      'INSERT INTO public.listings(id, seller_id, physical_copy_id, status, price, trade_available, dismissed_at) VALUES ($1, $2, $3, $4, $5, false, NULL)',
      [LISTING_OTHER_SELLER, OTHER_SELLER_ID, COPY_OTHER_SELLER, 'published', 2500]
    );

    await pg.query(
      'INSERT INTO public.listing_photos(id, listing_id, storage_path, role, display_order, alt_text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['40000000-0000-4000-8000-000000000001', LISTING_VISIBLE_PHOTO, 'seller/low-end-back.webp', 'back_cover', 0, 'Back cover', '2026-01-01T00:00:00.000Z']
    );
    await pg.query(
      'INSERT INTO public.listing_photos(id, listing_id, storage_path, role, display_order, alt_text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['40000000-0000-4000-8000-000000000002', LISTING_VISIBLE_PHOTO, 'seller/low-end-front.webp', 'front_cover', 0, 'Front sleeve', '2026-01-02T00:00:00.000Z']
    );
    await pg.query(
      'INSERT INTO public.listing_photos(id, listing_id, storage_path, role, display_order, alt_text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['40000000-0000-4000-8000-000000000003', LISTING_VISIBLE_PHOTO, 'seller/low-end-record.webp', 'record', 1, 'Vinyl record', '2026-01-03T00:00:00.000Z']
    );
    await pg.query(
      'INSERT INTO public.listing_photos(id, listing_id, storage_path, role, display_order, alt_text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['40000000-0000-4000-8000-000000000004', LISTING_VISIBLE_ART, 'seller/midnight-record.webp', 'record', 0, 'Record on turntable', '2026-02-01T00:00:00.000Z']
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it('uses two reads for populated results, preserves listing data and orders minimal public photos', async () => {
    const counted = countSelectQueries(db);
    const result = await getMyListings(SELLER_ID, false, counted.db);

    expect(counted.count()).toBe(2);
    expect(result.map((item) => item.id).sort()).toEqual([LISTING_VISIBLE_ART, LISTING_VISIBLE_PHOTO].sort());

    const withSellerPhotos = result.find((item) => item.id === LISTING_VISIBLE_PHOTO);
    expect(withSellerPhotos).toBeDefined();
    expect(withSellerPhotos?.status).toBe('draft');
    expect(withSellerPhotos?.tradeAvailable).toBe(false);
    expect(withSellerPhotos?.priceFormatted).toBe('€19.95');
    expect(withSellerPhotos?.physicalCopy).toEqual({ mediaCondition: 'NM', sleeveCondition: 'VG+' });
    expect(withSellerPhotos?.release).toEqual({
      title: 'The Low End Theory',
      artist: 'A Tribe Called Quest',
      releaseYear: 1991,
      coverArtUrl: 'https://catalog.example/low-end-theory.jpg',
    });
    expect(withSellerPhotos?.photos.map((photo) => photo.role)).toEqual(['back_cover', 'front_cover', 'record']);
    expect(withSellerPhotos?.photos[1]?.publicUrl).toBe(getPhotoPublicUrl('seller/low-end-front.webp'));
    expect(withSellerPhotos?.photos[1]?.altText).toBe('Front sleeve');
    expect(Object.keys(withSellerPhotos?.photos[0] || {}).sort()).toEqual([
      'altText',
      'displayOrder',
      'publicUrl',
      'role',
    ]);

    const withCatalogueArtFallback = result.find((item) => item.id === LISTING_VISIBLE_ART);
    expect(withCatalogueArtFallback?.priceFormatted).toBe('TRADE ONLY');
    expect(withCatalogueArtFallback?.release.coverArtUrl).toBe('https://catalog.example/midnight-marauders.jpg');
    expect(withCatalogueArtFallback?.photos.map((photo) => photo.role)).toEqual(['record']);

    const visibleHtml = await ejs.renderFile(
      listingsTemplatePath,
      { getIconSvg, listings: result, viewHidden: false },
      { filename: listingsTemplatePath }
    );
    expect(visibleHtml).toContain('The Low End Theory');
    expect(visibleHtml).toContain('Midnight Marauders');
    expect(visibleHtml).toContain(`href="/listings/${LISTING_VISIBLE_PHOTO}/preview"`);
  });

  it('keeps the hidden view restricted to dismissed listings and includes no visible rows', async () => {
    const counted = countSelectQueries(db);
    const result = await getMyListings(SELLER_ID, true, counted.db);

    expect(counted.count()).toBe(2);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(LISTING_HIDDEN);
    expect(result[0]?.status).toBe('sold');
    expect(result[0]?.priceFormatted).toBe('€15.00');
    expect(result[0]?.photos).toEqual([]);

    const hiddenHtml = await ejs.renderFile(
      listingsTemplatePath,
      { getIconSvg, listings: result, viewHidden: true },
      { filename: listingsTemplatePath }
    );
    expect(hiddenHtml).toContain('Doggystyle');
    expect(hiddenHtml).toContain(`href="/listings/${LISTING_HIDDEN}/restore-dismissed"`);
  });

  it('performs only the joined listing query when the seller has no results', async () => {
    const counted = countSelectQueries(db);
    const result = await getMyListings('cccccccc-cccc-4ccc-8ccc-cccccccccccc', false, counted.db);

    expect(result).toEqual([]);
    expect(counted.count()).toBe(1);
  });
});
