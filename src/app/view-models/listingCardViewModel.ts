export interface ListingCardViewModel {
  id: string;
  title: string;
  artist: string;
  releaseYear?: number | string;
  format?: string;
  priceFormatted: string;
  isTrade: boolean;
  mediaCondition: string;
  sleeveCondition: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  imageAlt: string;
  sellerUsername?: string;
  sellerLocation?: string;
  url: string;
}

/**
 * Format monetary minor units (e.g. 3495) into display price (e.g. "€34.95")
 */
export function formatPrice(minorUnits?: number | null, isTradeOnly = false): string {
  if (isTradeOnly || minorUnits === null || minorUnits === undefined) {
    return 'TRADE ONLY';
  }
  const euros = (minorUnits / 100).toFixed(2);
  return `€${euros}`;
}

/**
 * Build album cover image alt text according to accessibility standards.
 */
export function buildListingImageAlt(title: string, artist: string, format?: string): string {
  const formatSuffix = format ? ` (${format})` : '';
  return `Album cover artwork for ${title} by ${artist}${formatSuffix}`;
}

/**
 * Helper to build a clean ListingCardViewModel.
 */
export function buildListingCardViewModel(params: {
  id: string;
  title: string;
  artist: string;
  releaseYear?: number | string;
  format?: string;
  priceMinorUnits?: number | null;
  isTrade?: boolean;
  mediaCondition: string;
  sleeveCondition: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  sellerUsername?: string;
  sellerLocation?: string;
  url?: string;
}): ListingCardViewModel {
  const isTradeOnly = params.isTrade && !params.priceMinorUnits;
  const priceFormatted = formatPrice(params.priceMinorUnits, isTradeOnly);
  const imageAlt = buildListingImageAlt(params.title, params.artist, params.format);

  return {
    id: params.id,
    title: params.title,
    artist: params.artist,
    releaseYear: params.releaseYear,
    format: params.format,
    priceFormatted,
    isTrade: Boolean(params.isTrade),
    mediaCondition: params.mediaCondition,
    sleeveCondition: params.sleeveCondition,
    imageUrl: params.imageUrl,
    fallbackImageUrl: params.fallbackImageUrl,
    imageAlt,
    sellerUsername: params.sellerUsername,
    sellerLocation: params.sellerLocation,
    url: params.url || `/listings/${params.id}`,
  };
}

/**
 * Build ListingCardViewModel from DetailedListing object
 */
export function buildListingCardFromDetails(details: {
  listing: { id: string; price: number | null; tradeAvailable: boolean };
  release: { title: string; artist: string; releaseYear?: number | null; format?: string | null; coverArtUrl?: string | null };
  physicalCopy: { mediaCondition: string; sleeveCondition: string };
  seller: { username: string; location?: string | null };
  photos?: Array<{ publicUrl: string; role?: string; displayOrder?: number }>;
}): ListingCardViewModel {
  const primaryPhoto = details.photos?.find((photo) => photo.role === 'front_cover') || details.photos?.[0];
  const primaryImage = primaryPhoto?.publicUrl || details.release.coverArtUrl || undefined;
  const fallbackImage = primaryPhoto ? details.release.coverArtUrl || undefined : undefined;

  return buildListingCardViewModel({
    id: details.listing.id,
    title: details.release.title,
    artist: details.release.artist,
    releaseYear: details.release.releaseYear || undefined,
    format: details.release.format || undefined,
    priceMinorUnits: details.listing.price,
    isTrade: details.listing.tradeAvailable,
    mediaCondition: details.physicalCopy.mediaCondition,
    sleeveCondition: details.physicalCopy.sleeveCondition,
    imageUrl: primaryImage,
    fallbackImageUrl: fallbackImage,
    sellerUsername: details.seller.username,
    sellerLocation: details.seller.location || undefined,
    url: `/listings/${details.listing.id}/preview`,
  });
}
