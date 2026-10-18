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
      altText: explicitFront.altText || `Voorkant van de fysieke hoes van ${title} — ${artist}`,
      sourceLabel: 'Foto van de voorkant van deze fysieke kopie',
      sourceKind: 'seller_front',
    };
  } else if (legacyFirst) {
    front = {
      src: legacyFirst.publicUrl,
      altText: legacyFirst.altText || `Niet-geclassificeerde verkopersfoto van ${title} — ${artist}`,
      sourceLabel: 'Verkopersfoto — nog niet geclassificeerd',
      sourceKind: 'legacy_photo',
    };
  } else if (releaseCoverArtUrl) {
    front = {
      src: releaseCoverArtUrl,
      altText: `Release artwork-preview voor ${title} van ${artist}; geen foto van de aangeboden fysieke kopie`,
      sourceLabel: 'Release artwork / preview — geen bewijs van de conditie van deze kopie',
      sourceKind: 'release_artwork',
    };
  } else {
    front = {
      src: placeholderUrl,
      altText: `Geen bruikbare voorkantfoto beschikbaar voor ${title} van ${artist}`,
      sourceLabel: 'Geen foto van de voorkant beschikbaar',
      sourceKind: 'placeholder',
    };
  }

  const back: DigArtworkFace | null = explicitBack
    ? {
        src: explicitBack.publicUrl,
        altText: explicitBack.altText || `Achterkant van de fysieke hoes van ${title} — ${artist}`,
        sourceLabel: 'Foto van de achterkant van deze fysieke kopie',
        sourceKind: 'seller_back',
      }
    : null;

  return { front, back, hasExplicitBackCover: Boolean(explicitBack) };
}
