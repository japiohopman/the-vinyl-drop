/**
 * Canonical values and conservative normalization for structured Release metadata.
 * Raw provider text remains stored separately so new or unmappable Discogs values
 * are never silently discarded.
 */
export interface CountryOption {
  code: string;
  label: string;
}

const ISO_3166_ALPHA_2_CODES = [
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ',
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ',
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ',
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR',
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY',
  'HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP',
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY',
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ',
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW',
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ',
  'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',
].join(' ').split(/\s+/);

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
export const COUNTRY_OPTIONS: CountryOption[] = ISO_3166_ALPHA_2_CODES
  .map((code) => ({ code, label: displayNames.of(code) || code }))
  .sort((a, b) => a.label.localeCompare(b.label, 'en'));

function normalizeTaxonomyLabel(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const countryByCode = new Map(COUNTRY_OPTIONS.map((country) => [country.code, country]));
const countryByName = new Map(COUNTRY_OPTIONS.map((country) => [normalizeTaxonomyLabel(country.label), country]));

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'GB',
  'u k': 'GB',
  britain: 'GB',
  'great britain': 'GB',
  'united kingdom of great britain and northern ireland': 'GB',
  usa: 'US',
  'u s a': 'US',
  'united states of america': 'US',
  holland: 'NL',
  'the netherlands': 'NL',
  turkey: 'TR',
  turkiye: 'TR',
  'czech republic': 'CZ',
  'ivory coast': 'CI',
  'cote d ivoire': 'CI',
  'russian federation': 'RU',
  russia: 'RU',
  'south korea': 'KR',
  'republic of korea': 'KR',
  'north korea': 'KP',
  'democratic people s republic of korea': 'KP',
  taiwan: 'TW',
};

export function resolveCountry(value: string | null | undefined): CountryOption | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = normalizeTaxonomyLabel(value);
  const upper = value.trim().toUpperCase();
  if (countryByCode.has(upper)) return countryByCode.get(upper) || null;
  const aliasCode = COUNTRY_ALIASES[normalized];
  if (aliasCode) return countryByCode.get(aliasCode) || null;
  return countryByName.get(normalized) || null;
}

/**
 * Resolve the structured ISO code without overwriting the readable source value.
 * Discogs aliases and historical labels remain visible in the original country field.
 */
export function resolveReleaseCountryMetadata(
  sourceCountry: string | null | undefined,
  submittedCountryCode: string | null | undefined
): { country: string | null; countryCode: string | null } {
  const resolved = resolveCountry(submittedCountryCode || sourceCountry);
  return {
    country: sourceCountry || resolved?.label || null,
    countryCode: resolved?.code || null,
  };
}

export const RELEASE_GENRES = [
  'Blues',
  'Brass & Military',
  "Children's",
  'Classical',
  'Electronic',
  'Folk, World & Country',
  'Funk / Soul',
  'Hip Hop',
  'Jazz',
  'Latin',
  'Non-Music',
  'Pop',
  'Reggae',
  'Rock',
  'Stage & Screen',
  // Kept as a recognized legacy value because the current catalogue already uses it.
  'Ambient',
] as const;

export type ReleaseGenre = (typeof RELEASE_GENRES)[number];

const GENRE_ALIASES: Record<string, ReleaseGenre> = {
  blues: 'Blues',
  'brass military': 'Brass & Military',
  'brass and military': 'Brass & Military',
  childrens: "Children's",
  'children s': "Children's",
  classical: 'Classical',
  electronic: 'Electronic',
  electro: 'Electronic',
  'folk world country': 'Folk, World & Country',
  'folk world and country': 'Folk, World & Country',
  'funk soul': 'Funk / Soul',
  'funk and soul': 'Funk / Soul',
  funk: 'Funk / Soul',
  soul: 'Funk / Soul',
  'hip hop': 'Hip Hop',
  hiphop: 'Hip Hop',
  jazz: 'Jazz',
  latin: 'Latin',
  'non music': 'Non-Music',
  pop: 'Pop',
  reggae: 'Reggae',
  rock: 'Rock',
  'stage screen': 'Stage & Screen',
  'stage and screen': 'Stage & Screen',
  ambient: 'Ambient',
};

const normalizedGenreAliases = Object.entries(GENRE_ALIASES)
  .map(([alias, genre]) => [normalizeTaxonomyLabel(alias), genre] as const)
  .sort((a, b) => b[0].length - a[0].length);

function containsPhrase(text: string, phrase: string): boolean {
  return (' ' + text + ' ').includes(' ' + phrase + ' ');
}

/** Return recognized tags while preserving original provider text elsewhere. */
export function normalizeCanonicalGenres(value: string | string[] | null | undefined): ReleaseGenre[] {
  const source = Array.isArray(value) ? value.join(' ') : (value || '');
  if (!source.trim()) return [];
  const normalized = normalizeTaxonomyLabel(source);
  const matched = new Set<ReleaseGenre>();
  for (const [alias, genre] of normalizedGenreAliases) {
    if (containsPhrase(normalized, alias)) matched.add(genre);
  }
  return RELEASE_GENRES.filter((genre) => matched.has(genre));
}

/** Manual values must consist only of known vocabulary values or documented aliases. */
export function isKnownGenreInput(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || !value.trim()) return true;
  let remainder = ' ' + normalizeTaxonomyLabel(value) + ' ';
  for (const [alias] of normalizedGenreAliases) {
    remainder = remainder.split(' ' + alias + ' ').join(' ');
  }
  return remainder.trim().length === 0;
}

/** Resolve a single browse-filter value; multi-genre strings are not a single filter. */
export function resolveCanonicalGenre(value: string | null | undefined): ReleaseGenre | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return GENRE_ALIASES[normalizeTaxonomyLabel(value)] || null;
}

/**
 * Search terms for legacy raw genre fields. These aliases are used against a
 * punctuation-normalized SQL expression so values such as "Funk, Soul" remain
 * searchable through the canonical "Funk / Soul" filter.
 */
export function getCanonicalGenreSearchTerms(value: string | null | undefined): string[] {
  const canonical = resolveCanonicalGenre(value);
  if (!canonical) return [];

  const aliases = normalizedGenreAliases
    .filter(([, genre]) => genre === canonical)
    .map(([alias]) => alias);

  return [...new Set([normalizeTaxonomyLabel(canonical), ...aliases])];
}

/**
 * Controlled style vocabulary for vinyl discovery (Issue #391).
 * Styles are specific sub-classifications associated with one or more parent genres.
 */
export const RELEASE_STYLES = [
  'Dancehall',
  'Ska',
  'Punk',
  'House',
  'Techno',
  'Disco',
  'Funk',
  'Soul',
  'Classic Rock',
  'R&B / Rhythm & Blues',
] as const;

export type ReleaseStyle = (typeof RELEASE_STYLES)[number];

export const STYLE_PARENT_GENRES: Record<ReleaseStyle, readonly ReleaseGenre[]> = {
  Dancehall: ['Reggae'],
  Ska: ['Reggae'],
  Punk: ['Rock'],
  House: ['Electronic'],
  Techno: ['Electronic'],
  Disco: ['Funk / Soul', 'Electronic'],
  Funk: ['Funk / Soul'],
  Soul: ['Funk / Soul'],
  'Classic Rock': ['Rock'],
  'R&B / Rhythm & Blues': ['Funk / Soul'],
};

const STYLE_ALIASES: Record<string, ReleaseStyle> = {
  dancehall: 'Dancehall',
  ska: 'Ska',
  punk: 'Punk',
  house: 'House',
  techno: 'Techno',
  disco: 'Disco',
  funk: 'Funk',
  soul: 'Soul',
  'classic rock': 'Classic Rock',
  'r&b / rhythm & blues': 'R&B / Rhythm & Blues',
  'rhythm and blues': 'R&B / Rhythm & Blues',
  'rhythm & blues': 'R&B / Rhythm & Blues',
  'r&b': 'R&B / Rhythm & Blues',
  rnb: 'R&B / Rhythm & Blues',
  'r and b': 'R&B / Rhythm & Blues',
};

const normalizedStyleAliases = Object.entries(STYLE_ALIASES)
  .map(([alias, style]) => [normalizeTaxonomyLabel(alias), style] as const)
  .sort((a, b) => b[0].length - a[0].length);

/** Return recognized styles while preserving original provider text elsewhere. */
export function normalizeCanonicalStyles(value: string | string[] | null | undefined): ReleaseStyle[] {
  const source = Array.isArray(value) ? value.join(' ') : (value || '');
  if (!source.trim()) return [];
  const normalized = normalizeTaxonomyLabel(source);
  const matched = new Set<ReleaseStyle>();
  for (const [alias, style] of normalizedStyleAliases) {
    if (containsPhrase(normalized, alias)) matched.add(style);
  }
  return RELEASE_STYLES.filter((style) => matched.has(style));
}

/** Validate manual style entry against known controlled vocabulary or aliases. */
export function isKnownStyleInput(value: string | string[] | null | undefined): boolean {
  const source = Array.isArray(value) ? value.join(' ') : (value || '');
  if (!source.trim()) return true;
  let remainder = ' ' + normalizeTaxonomyLabel(source) + ' ';
  for (const [alias] of normalizedStyleAliases) {
    remainder = remainder.split(' ' + alias + ' ').join(' ');
  }
  return remainder.trim().length === 0;
}

/** Resolve a single browse-filter value for styles. */
export function resolveCanonicalStyle(value: string | null | undefined): ReleaseStyle | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return STYLE_ALIASES[normalizeTaxonomyLabel(value)] || null;
}

/** Retrieve styles associated with a parent genre in our taxonomy. */
export function getStylesForGenre(genre: ReleaseGenre): ReleaseStyle[] {
  return RELEASE_STYLES.filter((style) => STYLE_PARENT_GENRES[style].includes(genre));
}
