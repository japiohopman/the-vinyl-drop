import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import supertest from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { setOverrideDb } from '../src/db';
import { getEditListingPage, getPreviewListingPage, postUploadPhoto, postUpdateReleaseArtwork, postRestoreDiscogsArtwork } from '../src/app/controllers/listingController';
import { getDigBrowsePage } from '../src/app/controllers/browseController';
import { getCreateCustomReleasePage, postCreateCustomRelease } from '../src/app/controllers/releaseController';
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
      INSERT INTO public.releases (id, artist, title, cover_art_url, external_source, external_id)
      VALUES ('${releaseId}', 'Miles Davis', 'Kind of Blue', 'https://catalog.example/miles.jpg', 'discogs', '123456');
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
      const requestedUserId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : sellerId;
      req.user = { id: requestedUserId } as NonNullable<Request['user']>;
      next();
    };

    app.post(
      '/listings/:id/release-artwork',
      authenticateTestSeller,
      validateSameOrigin,
      multipartUploadHandler,
      postUpdateReleaseArtwork
    );
    app.post(
      '/listings/:id/release-artwork/restore-discogs',
      authenticateTestSeller,
      validateSameOrigin,
      postRestoreDiscogsArtwork
    );
    app.post(
      '/listings/:id/photos',
      authenticateTestSeller,
      validateSameOrigin,
      multipartUploadHandler,
      postUploadPhoto
    );
    app.get('/listings/:id/edit', authenticateTestSeller, getEditListingPage);
    app.get('/listings/:id/preview', authenticateTestSeller, getPreviewListingPage);
    app.get('/releases/new', authenticateTestSeller, getCreateCustomReleasePage);
    app.post('/releases/new', authenticateTestSeller, validateSameOrigin, multipartUploadHandler, postCreateCustomRelease);
    app.get('/browse/dig', getDigBrowsePage);
    app.use(errorHandler);
  });

  afterAll(async () => {
    clearInMemoryStorage();
    setOverrideDb(null);
    await database.close();
  });

  it('persists Discogs catalogue artwork from the multipart DROP form', async () => {
    const coverArtUrl = 'https://i.discogs.com/snoop-dogg-doggystyle.jpg';
    const response = await supertest(app)
      .post('/releases/new')
      .set('Origin', new URL(config.APP_BASE_URL).origin)
      .field('artist', 'Snoop Dogg')
      .field('title', 'Doggystyle')
      .field('format', 'LP')
      .field('coverArtUrl', coverArtUrl)
      .field('discogsExternalId', '234567');

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/^\/listings\/create\?releaseId=/);
    const releaseIdFromRedirect = response.headers.location.match(/releaseId=([0-9a-f-]+)/i)?.[1];
    expect(releaseIdFromRedirect).toBeTruthy();

    const stored = await database.query<{ cover_art_url: string | null; external_source: string | null; external_id: string | null }>(
      `SELECT cover_art_url, external_source, external_id FROM public.releases WHERE id = '${releaseIdFromRedirect}'`
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      cover_art_url: coverArtUrl,
      external_source: 'discogs',
      external_id: '234567',
    });
  });

  it('keeps release artwork separate from seller photo records and restricts artwork edits to the listing owner', async () => {
    const initialDig = await searchDigListings({ q: 'Kind of Blue' });
    expect(initialDig.items).toHaveLength(1);
    expect(initialDig.items[0].frontArtwork.sourceKind).toBe('catalogue_artwork');
    expect(initialDig.items[0].frontArtwork.src).toBe('https://catalog.example/miles.jpg');
    expect(initialDig.items[0].backArtwork).toBeNull();

    const initialEditor = await supertest(app).get(`/listings/${listingId}/edit`);
    expect(initialEditor.status).toBe(200);
    expect(initialEditor.text).toContain('class="release-artwork-editor"');
    expect(initialEditor.text).toContain('https://catalog.example/miles.jpg');
    expect(initialEditor.text).toContain('shared by listings of this same release');
    expect(initialEditor.text).toContain('Use original Discogs artwork');
    expect(initialEditor.text).toContain('name="coverArt"');
    expect(initialEditor.text).toContain('Photos of your actual copy');

    await database.exec(`UPDATE public.releases SET cover_art_url = NULL WHERE id = '${releaseId}'`);
    const noArtworkEditor = await supertest(app).get(`/listings/${listingId}/edit`);
    expect(noArtworkEditor.status).toBe(200);
    expect(noArtworkEditor.text).toContain('data-release-artwork-empty');
    expect(noArtworkEditor.text).toContain('name="coverArt"');
    expect(noArtworkEditor.text).not.toContain('No catalogue artwork is available yet; add a front photo');
    await database.exec(`UPDATE public.releases SET cover_art_url = 'https://catalog.example/miles.jpg' WHERE id = '${releaseId}'`);

    const artwork = await sharp({
      create: { width: 192, height: 192, channels: 3, background: { r: 210, g: 35, b: 75 } },
    }).jpeg().toBuffer();

    const denied = await supertest(app)
      .post(`/listings/${listingId}/release-artwork`)
      .set('Origin', new URL(config.APP_BASE_URL).origin)
      .set('x-test-user', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .attach('coverArt', artwork, { filename: 'not-the-owner.jpg', contentType: 'image/jpeg' });
    expect(denied.status).toBe(403);

    const deniedStored = await database.query<{ cover_art_url: string | null }>(
      `SELECT cover_art_url FROM public.releases WHERE id = '${releaseId}'`
    );
    expect(deniedStored.rows[0].cover_art_url).toBe('https://catalog.example/miles.jpg');
    expect(await findPhotosByListingId(listingId)).toHaveLength(0);

    const restoreDeniedFetch = jest.spyOn(global, 'fetch');
    const restoreDenied = await supertest(app)
      .post(`/listings/${listingId}/release-artwork/restore-discogs`)
      .set('Origin', new URL(config.APP_BASE_URL).origin)
      .set('x-test-user', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(restoreDenied.status).toBe(403);
    expect(restoreDeniedFetch).not.toHaveBeenCalled();
    restoreDeniedFetch.mockRestore();

    const invalidImage = await supertest(app)
      .post(`/listings/${listingId}/release-artwork`)
      .set('Origin', new URL(config.APP_BASE_URL).origin)
      .attach('coverArt', Buffer.from('not an image'), { filename: 'invalid.jpg', contentType: 'image/jpeg' });
    expect(invalidImage.status).toBe(302);
    expect(invalidImage.headers.location).toContain('releaseArtworkError=invalid');
    const invalidStored = await database.query<{ cover_art_url: string | null }>(
      `SELECT cover_art_url FROM public.releases WHERE id = '${releaseId}'`
    );
    expect(invalidStored.rows[0].cover_art_url).toBe('https://catalog.example/miles.jpg');
    expect(await findPhotosByListingId(listingId)).toHaveLength(0);

    const saved = await supertest(app)
      .post(`/listings/${listingId}/release-artwork`)
      .set('Origin', new URL(config.APP_BASE_URL).origin)
      .attach('coverArt', artwork, { filename: 'replacement.jpg', contentType: 'image/jpeg' });

    expect(saved.status).toBe(302);
    expect(saved.headers.location).toBe(`/listings/${listingId}/edit`);

    const storedArtwork = await database.query<{ cover_art_url: string | null }>(
      `SELECT cover_art_url FROM public.releases WHERE id = '${releaseId}'`
    );
    expect(storedArtwork.rows).toHaveLength(1);
    expect(storedArtwork.rows[0].cover_art_url).toMatch(/^data:image\/webp;base64,/);
    expect(await findPhotosByListingId(listingId)).toHaveLength(0);

    const editorAfterArtwork = await supertest(app).get(`/listings/${listingId}/edit`);
    expect(editorAfterArtwork.status).toBe(200);
    expect(editorAfterArtwork.text).toContain('Current release artwork');
    expect(editorAfterArtwork.text).toContain('data:image/webp;base64,');
    expect(editorAfterArtwork.text).toContain('Use original Discogs artwork');

    const digAfterArtwork = await searchDigListings({ q: 'Kind of Blue' });
    expect(digAfterArtwork.items[0].frontArtwork.sourceKind).toBe('catalogue_artwork');
    expect(digAfterArtwork.items[0].frontArtwork.src).toMatch(/^data:image\/webp;base64,/);

    const previewAfterArtwork = await supertest(app).get(`/listings/${listingId}/preview`);
    expect(previewAfterArtwork.status).toBe(200);
    expect(previewAfterArtwork.text).toContain('Release catalogue artwork · reference image');
    expect(previewAfterArtwork.text).toContain('data:image/webp;base64,');

    const unavailableRestore = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);
    let unavailableResponse;
    try {
      unavailableResponse = await supertest(app)
        .post(`/listings/${listingId}/release-artwork/restore-discogs`)
        .set('Origin', new URL(config.APP_BASE_URL).origin);
    } finally {
      unavailableRestore.mockRestore();
    }
    expect(unavailableResponse?.status).toBe(302);
    expect(unavailableResponse?.headers.location).toContain('releaseArtworkRestoreError=unavailable');
    const restoreErrorEditor = await supertest(app).get(`/listings/${listingId}/edit?releaseArtworkRestoreError=unavailable`);
    expect(restoreErrorEditor.status).toBe(200);
    expect(restoreErrorEditor.text).toContain('Your current release artwork has not changed.');
    const retainedArtwork = await database.query<{ cover_art_url: string | null }>(
      `SELECT cover_art_url FROM public.releases WHERE id = '${releaseId}'`
    );
    expect(retainedArtwork.rows[0].cover_art_url).toMatch(/^data:image\/webp;base64,/);

    const restoreFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        images: [{ resource_url: 'https://i.discogs.com/original-kind-of-blue.jpg' }],
      }),
    } as Response);
    let restoreResponse;
    try {
      restoreResponse = await supertest(app)
        .post(`/listings/${listingId}/release-artwork/restore-discogs`)
        .set('Origin', new URL(config.APP_BASE_URL).origin);
    } finally {
      restoreFetch.mockRestore();
    }

    expect(restoreResponse?.status).toBe(302);
    expect(restoreResponse?.headers.location).toBe(`/listings/${listingId}/edit`);
    const restoredArtwork = await database.query<{ cover_art_url: string | null }>(
      `SELECT cover_art_url FROM public.releases WHERE id = '${releaseId}'`
    );
    expect(restoredArtwork.rows[0].cover_art_url).toBe('https://i.discogs.com/original-kind-of-blue.jpg');
    expect(await findPhotosByListingId(listingId)).toHaveLength(0);

    const restoredDig = await searchDigListings({ q: 'Kind of Blue' });
    expect(restoredDig.items[0].frontArtwork.sourceKind).toBe('catalogue_artwork');
    expect(restoredDig.items[0].frontArtwork.src).toBe('https://i.discogs.com/original-kind-of-blue.jpg');
    const restoredPreview = await supertest(app).get(`/listings/${listingId}/preview`);
    expect(restoredPreview.status).toBe(200);
    expect(restoredPreview.text).toContain('https://i.discogs.com/original-kind-of-blue.jpg');

    const releaseForm = await supertest(app).get('/releases/new');
    expect(releaseForm.status).toBe(200);
    expect(releaseForm.text).toContain('data-discogs-cover-preview');
    expect(releaseForm.text).not.toContain('name="coverArt"');
    expect(releaseForm.text).not.toContain('Catalogue artwork replacement');
    expect(releaseForm.text).toContain('name="coverArtUrl"');
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

    const listingPhotoForm = await supertest(app).get(`/listings/${listingId}/edit`);
    expect(listingPhotoForm.status).toBe(200);
    expect(listingPhotoForm.text).toContain('Front of your copy');
    expect(listingPhotoForm.text).toContain('Back of your copy');
    expect(listingPhotoForm.text).toContain('Release artwork');
    expect(listingPhotoForm.text).toContain('https://i.discogs.com/original-kind-of-blue.jpg');
    expect(listingPhotoForm.text).toContain('default front image when you do not add a front photo of your copy');
    expect(listingPhotoForm.text).toContain('Use original Discogs artwork');
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
    expect(digResponse.text).not.toContain('https://i.discogs.com/original-kind-of-blue.jpg');
    expect(digResponse.text).not.toContain('Front cover not photographed');
    expect(digResponse.text).not.toContain('Back cover not photographed');
  });
});
