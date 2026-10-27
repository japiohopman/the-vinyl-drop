import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import supertest from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { setOverrideDb } from '../src/db';
import { getEditListingPage, postUploadPhoto } from '../src/app/controllers/listingController';
import { getDigBrowsePage } from '../src/app/controllers/browseController';
import { getCreateCustomReleasePage } from '../src/app/controllers/releaseController';
import { errorHandler } from '../src/app/middleware/errorHandler';
import { validateSameOrigin } from '../src/app/middleware/csrf';
import { multipartUploadHandler } from '../src/app/middleware/upload';
import { findPhotosByListingId } from '../src/app/repositories/listingPhotoRepository';
import { searchDigListings } from '../src/app/services/listingService';
import { clearInMemoryStorage } from '../src/app/services/storageService';
import { config } from '../src/config/env';

const sellerId = '11111111-1111-4111-8111-111111111111';
const releaseId = '22222222-2222-4222-8222-222222222222';
const copyId = '33333333-3333-4333-8333-333333333333';
const listingId = '44444444-4444-4444-8444-444444444444';

describe('Seller cover photo HTTP round trip', () => {
  let database: PGlite;
  let app: express.Express;

  beforeAll(async () => {
    database = new PGlite();
    const db = drizzle(database);
    setOverrideDb(db);
    clearInMemoryStorage();

    const migrations = [
      '0000_grey_living_tribunal.sql',
      '0001_add_physical_copies.sql',
      '0002_add_release_cover_art.sql',
      '0003_brainy_scarlet_witch.sql',
      '0004_mighty_spacker_dave.sql',
      '0014_add_listing_photo_roles.sql',
      '0015_dismiss_completed_listings.sql',
      '0018_add_release_youtube_preview.sql',
    ];

    for (const filename of migrations) {
      const sql = fs.readFileSync(path.join(process.cwd(), 'drizzle', filename), 'utf8');
      for (const statement of sql
        .split('--> statement-breakpoint')
        .map((part) => part.trim())
        .filter(Boolean)) {
        await database.exec(statement);
      }
    }

    await database.exec(`
      INSERT INTO public.profiles (id, username, display_name)
      VALUES ('${sellerId}', 'round_trip_seller', 'Round Trip Seller');
      INSERT INTO public.releases (id, artist, title, cover_art_url)
      VALUES ('${releaseId}', 'Miles Davis', 'Kind of Blue', 'https://catalog.example/miles.jpg');
      INSERT INTO public.physical_copies (id, release_id, owner_id, media_condition, sleeve_condition)
      VALUES ('${copyId}', '${releaseId}', '${sellerId}', 'NM', 'VG+');
      INSERT INTO public.listings (id, physical_copy_id, seller_id, price, status)
      VALUES ('${listingId}', '${copyId}', '${sellerId}', 2500, 'published');
    `);

    app = express();
    app.set('views', path.join(process.cwd(), 'views'));
    app.set('view engine', 'ejs');
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(process.cwd(), 'public')));
    app.use((req, res, next) => {
      res.locals.currentPath = req.path;
      res.locals.messagingEnabled = false;
      res.locals.betaInviteOnly = false;
      res.locals.inviteOnlyAccessMessage = '';
      res.locals.showBetaWelcome = false;
      res.locals.currentUser = null;
      res.locals.currentProfile = null;
      next();
    });

    const authenticateTestSeller = (req: Request, _res: Response, next: NextFunction): void => {
      req.user = { id: sellerId } as NonNullable<Request['user']>;
      next();
    };

    app.post(
      '/listings/:id/photos',
      authenticateTestSeller,
      validateSameOrigin,
      multipartUploadHandler,
      postUploadPhoto
    );
    app.get('/listings/:id/edit', authenticateTestSeller, getEditListingPage);
    app.get('/releases/new', authenticateTestSeller, getCreateCustomReleasePage);
    app.get('/browse/dig', getDigBrowsePage);
    app.use(errorHandler);
  });

  afterAll(async () => {
    clearInMemoryStorage();
    setOverrideDb(null);
    await database.close();
  });

  it('persists each submitted role and renders those exact stored photos in Dig', async () => {
    const frontImage = await sharp({
      create: { width: 128, height: 128, channels: 3, background: { r: 185, g: 40, b: 60 } },
    }).jpeg().toBuffer();
    const backImage = await sharp({
      create: { width: 128, height: 128, channels: 3, background: { r: 30, g: 80, b: 155 } },
    }).jpeg().toBuffer();

    // Deliberately append role/altText after the file part to cover multipart field ordering.
    const frontResponse = await supertest(app)
      .post(`/listings/${listingId}/photos`)
      .set('Origin', new URL(config.APP_BASE_URL).origin)
      .attach('photo', frontImage, { filename: 'physical-front.jpg', contentType: 'image/jpeg' })
      .field('role', 'front_cover')
      .field('altText', '');

    expect(frontResponse.status).toBe(302);
    expect(frontResponse.headers.location).toBe(`/listings/${listingId}/edit`);

    const backResponse = await supertest(app)
      .post(`/listings/${listingId}/photos`)
      .set('Origin', new URL(config.APP_BASE_URL).origin)
      .attach('photo', backImage, { filename: 'physical-back.jpg', contentType: 'image/jpeg' })
      .field('role', 'back_cover')
      .field('altText', '');

    expect(backResponse.status).toBe(302);
    expect(backResponse.headers.location).toBe(`/listings/${listingId}/edit`);

    const storedPhotos = await findPhotosByListingId(listingId);
    const front = storedPhotos.find((photo) => photo.role === 'front_cover');
    const back = storedPhotos.find((photo) => photo.role === 'back_cover');

    expect(front).toBeDefined();
    expect(back).toBeDefined();
    expect(front?.altText).toBe('Front cover of the record sleeve');
    expect(back?.altText).toBe('Back cover of the record sleeve');
    expect(front?.storagePath).toBeTruthy();
    expect(back?.storagePath).toBeTruthy();
    expect(front?.storagePath).not.toBe(back?.storagePath);

    const releaseForm = await supertest(app).get('/releases/new');
    expect(releaseForm.status).toBe(200);
    expect(releaseForm.text).toContain('Catalogue artwork (optional)');
    expect(releaseForm.text).toContain('This artwork represents the release edition.');
    expect(releaseForm.text).toContain('Photos of your physical copy are added in the next step.');
    expect(releaseForm.text).toContain('name="coverArt"');
    expect(releaseForm.text).not.toContain('name="photo"');
    expect(releaseForm.text).not.toContain('name="role"');

    const listingPhotoForm = await supertest(app).get(`/listings/${listingId}/edit`);
    expect(listingPhotoForm.status).toBe(200);
    expect(listingPhotoForm.text).toContain('Front cover');
    expect(listingPhotoForm.text).toContain('Back cover');
    expect(listingPhotoForm.text).toContain('Additional photos');
    expect(listingPhotoForm.text).toContain('Photo help');
    expect(listingPhotoForm.text).toContain('Choose photo');
    expect(listingPhotoForm.text).toContain('square-cover-cropper');
    expect(listingPhotoForm.text).not.toContain('Photos of this physical copy');
    expect(listingPhotoForm.text).not.toContain('Alt-tekst');
    expect(listingPhotoForm.text).toContain('name="photo"');
    expect(listingPhotoForm.text).toContain('name="role"');

    const digResults = await searchDigListings({ q: 'Kind of Blue' });
    expect(digResults.items).toHaveLength(1);
    expect(digResults.items[0].frontArtwork.sourceKind).toBe('seller_front');
    expect(digResults.items[0].frontArtwork.src).toBe(`/mock-storage/${front?.storagePath}`);
    expect(digResults.items[0].backArtwork?.sourceKind).toBe('seller_back');
    expect(digResults.items[0].backArtwork?.src).toBe(`/mock-storage/${back?.storagePath}`);

    const digResponse = await supertest(app).get('/browse/dig?q=Kind+of+Blue');
    expect(digResponse.status).toBe(200);
    expect(digResponse.text).toContain(`/mock-storage/${front?.storagePath}`);
    expect(digResponse.text).toContain(`/mock-storage/${back?.storagePath}`);
    expect(digResponse.text).not.toContain('https://catalog.example/miles.jpg');
    expect(digResponse.text).not.toContain('Front cover not photographed');
    expect(digResponse.text).not.toContain('Back cover not photographed');
  });
});
