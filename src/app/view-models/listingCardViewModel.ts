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
  photos?: Array<{ publicUrl: string }>;
}): ListingCardViewModel {
  const primaryImage =
    details.photos && details.photos.length > 0
      ? details.photos[0].publicUrl
      : details.release.coverArtUrl || undefined;

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
    sellerUsername: details.seller.username,
    sellerLocation: details.seller.location || undefined,
    url: `/listings/${details.listing.id}/preview`,
  });
}
