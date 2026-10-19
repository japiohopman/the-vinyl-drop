import { ListingPhotoRole } from './listingPhotoRole';

export interface DigPhotoCandidate {
  role: ListingPhotoRole;
  displayOrder: number;
  publicUrl: string;
  altText: string | null;
}

export interface DigArtworkFace {
  src: string;
  altText: string;
  sourceLabel: string;
  sourceKind: 'seller_front' | 'legacy_photo' | 'release_artwork' | 'placeholder' | 'seller_back';
}

export interface DigArtworkSelection {
  front: DigArtworkFace;
  back: DigArtworkFace | null;
  hasExplicitBackCover: boolean;
}

/**
 * Resolve the two sleeve faces without guessing from arbitrary gallery order.
 * Only an explicitly classified back_cover may appear on the back face.
 */
export function resolveDigArtwork(
  inputPhotos: DigPhotoCandidate[],
  releaseCoverArtUrl: string | null | undefined,
  title: string,
  artist: string,
  placeholderUrl = '/assets/vinyl-placeholder.svg'
): DigArtworkSelection {
  const photos = [...inputPhotos].sort((a, b) => a.displayOrder - b.displayOrder);
  const explicitFront = photos.find((photo) => photo.role === 'front_cover');
  const firstPhoto = photos[0];

  // Compatibility only: a first legacy photo may be displayed as a fallback.
  // Its persisted role remains legacy_unclassified and is never silently promoted.
  const legacyFirst = firstPhoto?.role === 'legacy_unclassified' ? firstPhoto : undefined;
  const explicitBack = photos.find((photo) => photo.role === 'back_cover');

  let front: DigArtworkFace;
  if (explicitFront) {
    front = {
      src: explicitFront.publicUrl,
      altText: explicitFront.altText || `Front cover of the physical sleeve of ${title} — ${artist}`,
      sourceLabel: 'Photo of the front cover of this physical copy',
      sourceKind: 'seller_front',
    };
  } else if (legacyFirst) {
    front = {
      src: legacyFirst.publicUrl,
      altText: legacyFirst.altText || `Unclassified seller photo of ${title} — ${artist}`,
      sourceLabel: 'Seller photo — not yet classified',
      sourceKind: 'legacy_photo',
    };
  } else if (releaseCoverArtUrl) {
    front = {
      src: releaseCoverArtUrl,
      altText: `Release artwork preview for ${title} by ${artist}; not a photo of the physical copy being offered`,
      sourceLabel: 'Release artwork / preview — not evidence of this copy's condition',
      sourceKind: 'release_artwork',
    };
  } else {
    front = {
      src: placeholderUrl,
      altText: `No usable front-cover photo available for ${title} by ${artist}`,
      sourceLabel: 'No front-cover photo available',
      sourceKind: 'placeholder',
    };
  }

  const back: DigArtworkFace | null = explicitBack
    ? {
        src: explicitBack.publicUrl,
        altText: explicitBack.altText || `Back cover of the physical sleeve of ${title} — ${artist}`,
        sourceLabel: 'Photo of the back cover of this physical copy',
        sourceKind: 'seller_back',
      }
    : null;

  return { front, back, hasExplicitBackCover: Boolean(explicitBack) };
}
