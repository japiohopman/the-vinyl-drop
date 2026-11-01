import { searchCatalogueSuggestionRows, type CatalogueSuggestionKind } from '../repositories/catalogueSearchRepository';
import { normalizeCatalogueSearchQuery } from '../utils/catalogueSearch';
import type { getDb } from '../../db';

type DbInstance = ReturnType<typeof getDb>;

export interface CatalogueSearchSuggestion {
  type: CatalogueSuggestionKind;
  label: string;
  value: string;
  query: string;
  context: string | null;
}

const KIND_PRIORITY: Record<CatalogueSuggestionKind, number> = {
  artist: 0,
  release: 1,
  label: 2,
};

/** Merge, deduplicate and rank the bounded artist, release and label result sets. */
export async function getCatalogueSearchSuggestions(
  query: string,
  dbOverride?: DbInstance
): Promise<CatalogueSearchSuggestion[]> {
  const normalizedQuery = normalizeCatalogueSearchQuery(query);
  if (Array.from(normalizedQuery).length < 2) return [];

  const rows = await searchCatalogueSuggestionRows(query.trim(), normalizedQuery, dbOverride);
  const unique = new Map<string, typeof rows[number]>();

  for (const row of rows) {
    const key = row.kind + ':' + normalizeCatalogueSearchQuery(row.value) + ':' +
      (row.kind === 'release' ? normalizeCatalogueSearchQuery(row.context || '') : '');
    const current = unique.get(key);
    if (!current || row.rank < current.rank ||
      (row.rank === current.rank && row.similarity > current.similarity)) {
      unique.set(key, row);
    }
  }

  return Array.from(unique.values())
    .sort((a, b) =>
      a.rank - b.rank ||
      b.similarity - a.similarity ||
      KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] ||
      a.value.localeCompare(b.value)
    )
    .slice(0, 8)
    .map((row) => ({
      type: row.kind,
      label: row.kind === 'release' && row.context ? row.context + ' — ' + row.value : row.value,
      value: row.value,
      query: row.value,
      context: row.context,
    }));
}
