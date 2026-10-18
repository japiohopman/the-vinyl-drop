export const VINYL_FORMAT_FILTERS = [
  { value: 'lp', label: 'LP', description: 'Long-playing / album format' },
  { value: '12-inch', label: '12-inch', description: 'Explicitly identified 12-inch diameter' },
  { value: '7-inch', label: '7-inch', description: 'Explicitly identified 7-inch diameter' },
] as const;

export type VinylFormatFilter = (typeof VINYL_FORMAT_FILTERS)[number]['value'];

/**
 * Format is legacy free text from release metadata. Match named album format
 * and physical diameter independently: "12-inch single" is not an LP unless
 * its format string also explicitly identifies LP / long-play / album.
 *
 * Keep the PostgreSQL patterns and the JS test helper semantically aligned.
 * No diameter is guessed from "LP", "single", rpm, or the word "vinyl" alone.
 */
const JAVASCRIPT_PATTERNS: Record<VinylFormatFilter, RegExp> = {
  lp: /(?:^|[^a-z0-9])(?:lp|long[\s_-]*play(?:ing)?|album)(?:$|[^a-z0-9])/i,
  '12-inch': /(?:^|[^0-9])12\s*(?:-?inch(?:es)?|in\b|["″])(?=$|[^a-z])/i,
  '7-inch': /(?:^|[^0-9])7\s*(?:-?inch(?:es)?|in\b|["″])(?=$|[^a-z])/i,
};

const POSTGRES_PATTERNS: Record<VinylFormatFilter, string> = {
  lp: '(^|[^[:alnum:]])(lp|long[[:space:]_-]*play(ing)?|album)([^[:alnum:]]|$)',
  '12-inch': '(^|[^0-9])12[[:space:]]*(-?inch(es)?|in|"|″)([^[:alpha:]]|$)',
  '7-inch': '(^|[^0-9])7[[:space:]]*(-?inch(es)?|in|"|″)([^[:alpha:]]|$)',
};

export function parseVinylFormatFilters(value: unknown): VinylFormatFilter[] {
  const values = Array.isArray(value) ? value : [value];
  const allowed = new Set<string>(VINYL_FORMAT_FILTERS.map((filter) => filter.value));
  return [...new Set(values.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => allowed.has(item)))] as VinylFormatFilter[];
}

export function matchesVinylFormatFilter(format: string | null | undefined, filter: VinylFormatFilter): boolean {
  return typeof format === 'string' && JAVASCRIPT_PATTERNS[filter].test(format);
}

export function getVinylFormatPostgresPattern(filter: VinylFormatFilter): string {
  return POSTGRES_PATTERNS[filter];
}

export const WHITE_LABEL_POSTGRES_PATTERN =
  '(^|[^[:alnum:]])white[[:space:]_-]+label([^[:alnum:]]|$)';

export function isExplicitWhiteLabel(label: string | null | undefined): boolean {
  return typeof label === 'string' && /(?:^|[^a-z0-9])white[\s_-]+label(?:$|[^a-z0-9])/i.test(label);
}

/** Toggle a selected format chip; return a new stable list without duplicates. */
export function toggleVinylFormatFilter(
  selectedFormats: VinylFormatFilter[],
  toggledFormat: VinylFormatFilter
): VinylFormatFilter[] {
  return selectedFormats.includes(toggledFormat)
    ? selectedFormats.filter((format) => format !== toggledFormat)
    : [...selectedFormats, toggledFormat];
}

/** Parse the optional white-label chip state and toggle it only when that button was used. */
export function resolveWhiteLabelFilter(currentValue: unknown, toggleSubmitted: boolean): boolean {
  const isSelected = currentValue === '1';
  return toggleSubmitted ? !isSelected : isSelected;
}
