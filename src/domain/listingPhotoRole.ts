export const LISTING_PHOTO_ROLES = [
  'front_cover',
  'back_cover',
  'inside_sleeve',
  'insert_poster',
  'record',
  'detail',
  'other',
  'legacy_unclassified',
] as const;

/** Roles sellers may assign while uploading a new photo. */
export const NEW_LISTING_PHOTO_ROLES = [
  'front_cover',
  'back_cover',
  'inside_sleeve',
  'insert_poster',
  'record',
  'detail',
  'other',
] as const;

export type ListingPhotoRole = (typeof LISTING_PHOTO_ROLES)[number];
export type NewListingPhotoRole = (typeof NEW_LISTING_PHOTO_ROLES)[number];

export const LISTING_PHOTO_ROLE_LABELS: Record<ListingPhotoRole, string> = {
  front_cover: 'Front cover',
  back_cover: 'Back cover',
  inside_sleeve: 'Inside sleeve / gatefold',
  insert_poster: 'Insert / poster',
  record: 'Record / label',
  detail: 'Condition detail',
  other: 'Other',
  legacy_unclassified: 'Unclassified (legacy photo)',
};

export const LISTING_PHOTO_ROLE_GUIDANCE: Record<ListingPhotoRole, string> = {
  front_cover: 'Photograph the full front of the actual sleeve straight-on. Keep all edges visible and avoid glare.',
  back_cover: 'Photograph the complete back of the same sleeve; keep text readable where possible.',
  inside_sleeve: 'Open the gatefold or clearly show the actual inner sleeve.',
  insert_poster: 'Show the included printed insert or poster clearly enough to identify it.',
  record: 'Photograph the actual record or label. Mention Side A or Side B in the alt text when relevant.',
  detail: 'Clearly show visible wear or defects. Do not hide or crop them out.',
  other: 'Show other relevant material that belongs to this exact physical copy.',
  legacy_unclassified: 'This older photo has not been classified yet. Choose the correct role when you can identify what it shows.',
};
