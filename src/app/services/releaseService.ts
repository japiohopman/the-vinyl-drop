import { getDb } from '../../db';
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
import { getDiscogsReleaseArtwork } from './discogsService';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';

type DbInstance = ReturnType<typeof getDb>;

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
  return updatedRelease;
}

export async function updateReleaseArtworkForListing(
  listingId: string,
  requestingUserId: string,
  submittedArtwork: unknown,
  dbOverride?: DbInstance
): Promise<Release> {
  if (
    typeof submittedArtwork !== 'string' ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(submittedArtwork)
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

  const updatedRelease = await updateReleaseCoverArtUrl(release.id, submittedArtwork, dbOverride);
  if (!updatedRelease) throw new NotFoundError('Associated release not found');
  return updatedRelease;
}

export async function createRelease(input: ReleaseInput, dbOverride?: DbInstance): Promise<Release> {
  const parseResult = releaseSchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid release metadata: ${issueMsg}`);
  }

  const data = parseResult.data;

  return createReleaseInRepo(
    {
      artist: data.artist,
      title: data.title,
      label: data.label || null,
      catalogueNumber: data.catalogueNumber || null,
      releaseYear: data.releaseYear || null,
      country: data.country || null,
      format: data.format || null,
      barcode: data.barcode || null,
      genre: data.genre || null,
      coverArtUrl: data.coverArtUrl || null,
      externalSource: data.externalSource || null,
      externalId: data.externalId || null,
    },
    dbOverride
  );
}
