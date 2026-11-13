import crypto from 'crypto';
import { getDb } from '../../db';
import { config } from '../../config/env';
import { Release } from '../../db/schema/releases';
import { releaseSchema, ReleaseInput } from '../../validators/release';
import {
  createRelease as createReleaseInRepo,
  findReleaseById,
  updateReleaseYouTubeVideoId,
  updateReleaseCoverArtUrl,
} from '../repositories/releaseRepository';
import { findListingById } from '../repositories/listingRepository';
import { findPhysicalCopyById } from '../repositories/physicalCopyRepository';
import { normalizeYouTubeVideoId } from '../../validators/youtubePreview';
import { normalizeCanonicalGenres, normalizeCanonicalStyles, resolveReleaseCountryMetadata } from '../../domain/releaseMetadata';
import { normalizeVinylFormatCharacteristics } from '../../domain/releaseFormat';
import { getDiscogsReleaseArtwork } from './discogsService';
import { ProcessedImage } from '../utils/imageProcessor';
import {
  deleteListingPhotoFromStorage,
  getPhotoPublicUrl,
  StorageOptions,
  uploadListingPhotoToStorage,
} from './storageService';
import { recordOrphanedStorageObject } from '../repositories/orphanRepository';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';

type DbInstance = ReturnType<typeof getDb>;

type StoredReleaseArtwork = { storagePath: string; ownerListingId: string };

function getStoredReleaseArtwork(url: string | null): StoredReleaseArtwork | null {
  if (!url) return null;

  let storagePath: string | null = null;
  if (config.NODE_ENV === 'test' && url.startsWith('/mock-storage/')) {
    storagePath = url.slice('/mock-storage/'.length);
  } else if (config.SUPABASE_URL) {
    const publicBucketPrefix = config.SUPABASE_URL.replace(/\/+$/, '') +
      '/storage/v1/object/public/listing-photos/';
    if (url.startsWith(publicBucketPrefix)) {
      storagePath = url.slice(publicBucketPrefix.length);
    }
  }

  if (!storagePath) return null;
  const match = /^listings\/([0-9a-f-]{36})\/release-artwork-([0-9a-f-]{36})\.webp$/i.exec(storagePath);
  if (!match) return null;
  return { storagePath, ownerListingId: match[1] };
}

async function recordReleaseArtworkOrphan(
  listingId: string,
  storagePath: string,
  reason: string,
  dbOverride?: DbInstance
): Promise<void> {
  try {
    await recordOrphanedStorageObject({ listingId, storagePath, reason }, dbOverride);
  } catch {
    console.error(JSON.stringify({
      event: 'release_artwork_storage_orphan_unresolved',
      listingId,
      storagePath,
      reason,
    }));
  }
}

async function removeReleaseArtworkObject(
  listingId: string,
  storagePath: string,
  storageOptions: StorageOptions | undefined,
  dbOverride: DbInstance | undefined,
  reason: string
): Promise<void> {
  try {
    await deleteListingPhotoFromStorage(storagePath, storageOptions);
  } catch {
    await recordReleaseArtworkOrphan(listingId, storagePath, reason, dbOverride);
  }
}

/** Remove a superseded upload only when the current listing owner can manage its Storage folder. */
async function cleanUpSupersededReleaseArtwork(
  previousArtworkUrl: string | null,
  currentListingId: string,
  storageOptions?: StorageOptions,
  dbOverride?: DbInstance
): Promise<void> {
  const previous = getStoredReleaseArtwork(previousArtworkUrl);
  if (!previous) return;

  if (previous.ownerListingId !== currentListingId) {
    await recordReleaseArtworkOrphan(
      currentListingId,
      previous.storagePath,
      'RELEASE_ARTWORK_SUPERSEDED_OBJECT_REQUIRES_ORIGINAL_OWNER_CLEANUP',
      dbOverride
    );
    return;
  }

  await removeReleaseArtworkObject(
    currentListingId,
    previous.storagePath,
    storageOptions,
    dbOverride,
    'RELEASE_ARTWORK_SUPERSEDED_STORAGE_DELETE_FAILED'
  );
}

export async function getReleaseById(id: string, dbOverride?: DbInstance): Promise<Release | null> {
  return findReleaseById(id, dbOverride);
}

export async function updateReleaseYouTubePreviewForListing(
  listingId: string,
  requestingUserId: string,
  submittedUrl: unknown,
  dbOverride?: DbInstance
): Promise<Release> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this listing release preview');
  }

  const physicalCopy = await findPhysicalCopyById(listing.physicalCopyId, dbOverride);
  if (!physicalCopy) throw new NotFoundError('Associated physical copy not found');
  const release = await findReleaseById(physicalCopy.releaseId, dbOverride);
  if (!release) throw new NotFoundError('Associated release not found');

  let youtubeVideoId: string | null;
  try {
    youtubeVideoId = normalizeYouTubeVideoId(submittedUrl);
  } catch {
    throw new ValidationError('Enter a valid YouTube watch or share URL, or leave the field blank to remove the preview.');
  }

  const updatedRelease = await updateReleaseYouTubeVideoId(release.id, youtubeVideoId, dbOverride);
  if (!updatedRelease) throw new NotFoundError('Associated release not found');
  return updatedRelease;
}

export async function restoreDiscogsArtworkForListing(
  listingId: string,
  requestingUserId: string,
  storageOptions?: StorageOptions,
  dbOverride?: DbInstance
): Promise<Release> {
  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this listing release artwork');
  }

  const physicalCopy = await findPhysicalCopyById(listing.physicalCopyId, dbOverride);
  if (!physicalCopy) throw new NotFoundError('Associated physical copy not found');
  const release = await findReleaseById(physicalCopy.releaseId, dbOverride);
  if (!release) throw new NotFoundError('Associated release not found');

  if (release.externalSource !== 'discogs' || !release.externalId || !/^\d{1,15}$/.test(release.externalId)) {
    throw new ValidationError('This release has no saved Discogs source artwork to restore.');
  }

  let discogsArtworkUrl: string | null;
  try {
    discogsArtworkUrl = await getDiscogsReleaseArtwork(release.externalId);
  } catch {
    throw new ValidationError('Discogs artwork is temporarily unavailable. Your current release artwork has not changed.');
  }
  if (!discogsArtworkUrl) {
    throw new ValidationError('The original Discogs release has no available catalogue artwork. Your current artwork has not changed.');
  }

  const updatedRelease = await updateReleaseCoverArtUrl(release.id, discogsArtworkUrl, dbOverride);
  if (!updatedRelease) throw new NotFoundError('Associated release not found');
  await cleanUpSupersededReleaseArtwork(release.coverArtUrl, listingId, storageOptions, dbOverride);
  return updatedRelease;
}

export async function updateReleaseArtworkForListing(
  listingId: string,
  requestingUserId: string,
  submittedArtwork: ProcessedImage,
  storageOptions?: StorageOptions,
  dbOverride?: DbInstance
): Promise<Release> {
  if (
    !submittedArtwork ||
    !Buffer.isBuffer(submittedArtwork.buffer) ||
    submittedArtwork.buffer.length === 0 ||
    submittedArtwork.contentType !== 'image/webp' ||
    submittedArtwork.extension !== 'webp' ||
    !Number.isFinite(submittedArtwork.width) ||
    !Number.isFinite(submittedArtwork.height) ||
    submittedArtwork.width < 1 ||
    submittedArtwork.height < 1
  ) {
    throw new ValidationError('Choose a valid processed catalogue artwork image.');
  }

  const listing = await findListingById(listingId, dbOverride);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this listing release artwork');
  }

  const physicalCopy = await findPhysicalCopyById(listing.physicalCopyId, dbOverride);
  if (!physicalCopy) throw new NotFoundError('Associated physical copy not found');
  const release = await findReleaseById(physicalCopy.releaseId, dbOverride);
  if (!release) throw new NotFoundError('Associated release not found');

  const storagePath = await uploadListingPhotoToStorage({
    listingId,
    photoId: 'release-artwork-' + crypto.randomUUID(),
    buffer: submittedArtwork.buffer,
    contentType: submittedArtwork.contentType,
    extension: submittedArtwork.extension,
    options: storageOptions,
  });
  const artworkUrl = getPhotoPublicUrl(storagePath);

  let updatedRelease: Release | null;
  try {
    updatedRelease = await updateReleaseCoverArtUrl(release.id, artworkUrl, dbOverride);
  } catch (error) {
    await removeReleaseArtworkObject(
      listingId,
      storagePath,
      storageOptions,
      dbOverride,
      'RELEASE_ARTWORK_UPLOAD_DB_UPDATE_FAILED_STORAGE_DELETE_FAILED'
    );
    throw error;
  }

  if (!updatedRelease) {
    await removeReleaseArtworkObject(
      listingId,
      storagePath,
      storageOptions,
      dbOverride,
      'RELEASE_ARTWORK_UPLOAD_DB_UPDATE_MISSING_STORAGE_DELETE_FAILED'
    );
    throw new NotFoundError('Associated release not found');
  }

  await cleanUpSupersededReleaseArtwork(release.coverArtUrl, listingId, storageOptions, dbOverride);
  return updatedRelease;
}

export async function createRelease(input: ReleaseInput, dbOverride?: DbInstance): Promise<Release> {
  const parseResult = releaseSchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid release metadata: ${issueMsg}`);
  }

  const data = parseResult.data;
  const countryMetadata = resolveReleaseCountryMetadata(data.country, data.countryCode);
  const rawStyles = Array.isArray(data.styles)
    ? data.styles
    : typeof data.styles === 'string' && data.styles.trim()
      ? data.styles.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  return createReleaseInRepo(
    {
      artist: data.artist,
      title: data.title,
      contentType: data.contentType,
      label: data.label || null,
      catalogueNumber: data.catalogueNumber || null,
      releaseYear: data.releaseYear || null,
      country: countryMetadata.country,
      countryCode: countryMetadata.countryCode,
      format: data.format || null,
      formatCharacteristics: data.formatCharacteristics?.length
        ? data.formatCharacteristics
        : normalizeVinylFormatCharacteristics(data.format),
      barcode: data.barcode || null,
      genre: data.genre || null,
      canonicalGenres: normalizeCanonicalGenres(data.genre),
      styles: rawStyles,
      canonicalStyles: normalizeCanonicalStyles(rawStyles),
      coverArtUrl: data.coverArtUrl || null,
      externalSource: data.externalSource || null,
      externalId: data.externalId || null,
    },
    dbOverride
  );
}
