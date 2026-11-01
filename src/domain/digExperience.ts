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
  sourceKind: 'seller_front' | 'catalogue_artwork' | 'placeholder' | 'seller_back';
}

export interface DigArtworkSelection {
  front: DigArtworkFace;
  back: DigArtworkFace | null;
  hasExplicitBackCover: boolean;
}

/**
 * Prefer a seller-selected front photo for this physical copy, then use the
 * release catalogue artwork as the visual fallback. Catalogue artwork is
 * explicitly labelled as reference art, never as a seller photo.
 */
export function resolveDigArtwork(
  inputPhotos: DigPhotoCandidate[],
  title: string,
  artist: string,
  placeholderUrl = '/assets/vinyl-placeholder.svg'
): DigArtworkSelection {
  const photos = [...inputPhotos].sort((a, b) => a.displayOrder - b.displayOrder);
  const explicitFront = photos.find((photo) => photo.role === 'front_cover');
  const explicitBack = photos.find((photo) => photo.role === 'back_cover');

  const front: DigArtworkFace = explicitFront
    ? {
        src: explicitFront.publicUrl,
        altText: explicitFront.altText || `Front cover of the physical sleeve of ${title} — ${artist}`,
        sourceLabel: 'Photo of the front cover of this physical copy',
        sourceKind: 'seller_front',
      }
    : catalogueArtworkUrl
      ? {
          src: catalogueArtworkUrl,
          altText: `Catalogue artwork for ${title} — ${artist}; release reference, not a photo of this physical copy`,
          sourceLabel: 'Discogs catalogue artwork — release reference',
          sourceKind: 'catalogue_artwork',
        }
      : {
          src: placeholderUrl,
          altText: `No front-cover photo or catalogue artwork available for ${title} — ${artist}`,
          sourceLabel: 'No front-cover artwork available',
          sourceKind: 'placeholder',
        };

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
