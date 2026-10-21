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
  sourceKind: 'seller_front' | 'placeholder' | 'seller_back';
}

export interface DigArtworkSelection {
  front: DigArtworkFace;
  back: DigArtworkFace | null;
  hasExplicitBackCover: boolean;
}

/**
 * Resolve Dig sleeve faces only from the seller-selected photo roles.
 *
 * Release catalogue art and legacy/unclassified photos belong to older
 * artwork paths and must never be substituted for photos of this physical copy.
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
    : {
        src: placeholderUrl,
        altText: `No front-cover photo available for the physical copy of ${title} — ${artist}`,
        sourceLabel: 'No front-cover photo available',
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
