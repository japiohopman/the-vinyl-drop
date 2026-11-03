export const MAX_CATALOGUE_SEARCH_QUERY_LENGTH = 80;

/** Normalize a comparison key without changing canonical catalogue display text. */
export function normalizeCatalogueSearchQuery(value: string): string {
  return value.normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\p{Z}\s]+/gu, '');
}
