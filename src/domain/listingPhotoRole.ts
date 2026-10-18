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
  front_cover: 'Voorkant',
  back_cover: 'Achterkant',
  inside_sleeve: 'Binnenkant / gatefold',
  insert_poster: 'Poster / insert',
  record: 'Plaat / label',
  detail: 'Detail / conditie',
  other: 'Overig',
  legacy_unclassified: 'Nog niet geclassificeerd (oude foto)',
};

export const LISTING_PHOTO_ROLE_GUIDANCE: Record<ListingPhotoRole, string> = {
  front_cover: 'Fotografeer de volledige voorkant van de echte hoes recht van voren, met alle randen zichtbaar en zo min mogelijk reflectie.',
  back_cover: 'Fotografeer de achterkant van dezelfde hoes volledig in beeld; houd tekst waar mogelijk leesbaar.',
  inside_sleeve: 'Open de gatefold of laat de daadwerkelijke binnenhoes duidelijk zien.',
  insert_poster: 'Breng het meegeleverde drukwerk volledig genoeg in beeld om het te herkennen.',
  record: 'Fotografeer de echte plaat of het label; vermeld Side A of Side B in de alt-tekst als dat relevant is.',
  detail: 'Leg zichtbare slijtage of defecten duidelijk vast en verberg of snijd ze niet weg.',
  other: 'Toon ander relevant materiaal dat bij precies deze fysieke kopie hoort.',
  legacy_unclassified: 'Deze oudere foto is nog niet geclassificeerd. Kies de juiste rol zodra je kunt vaststellen wat erop staat.',
};
