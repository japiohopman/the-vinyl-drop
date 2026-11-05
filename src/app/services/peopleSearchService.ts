import { searchPublicPeople, type PublicPersonSearchRecord } from '../repositories/peopleSearchRepository';
import type { getDb } from '../../db';

type DbInstance = ReturnType<typeof getDb>;

export const MIN_PEOPLE_SEARCH_QUERY_LENGTH = 2;
export const MAX_PEOPLE_SEARCH_QUERY_LENGTH = 50;
export const PEOPLE_SEARCH_PAGE_SIZE = 12;
export const MAX_PEOPLE_SEARCH_PAGES = 20;
export const PEOPLE_SEARCH_SUGGESTION_LIMIT = 8;

export interface PeopleSearchPage {
  items: PublicPersonSearchRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

/** Normalize user-entered text without changing the canonical profile strings shown to visitors. */
export function normalizePeopleSearchQuery(query: string): string {
  return query.normalize('NFKC').trim().toLowerCase();
}

/** Check the minimum query length after Unicode NFKC normalization and whitespace trimming. */
export function isPeopleSearchQueryLongEnough(query: string): boolean {
  return Array.from(normalizePeopleSearchQuery(query)).length >= MIN_PEOPLE_SEARCH_QUERY_LENGTH;
}

/** Search public profile identities only; page size and total page count remain bounded. */
export async function searchPeople(
  query: string,
  requestedPage = 1,
  dbOverride?: DbInstance
): Promise<PeopleSearchPage> {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  const page = Math.min(MAX_PEOPLE_SEARCH_PAGES, Math.max(1, Math.floor(requestedPage)));

  if (!isPeopleSearchQueryLongEnough(normalizedQuery)) {
    return {
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: PEOPLE_SEARCH_PAGE_SIZE,
      totalPages: 0,
      hasMore: false,
    };
  }

  let offset = (page - 1) * PEOPLE_SEARCH_PAGE_SIZE;
  let result = await searchPublicPeople(
    normalizedQuery,
    { limit: PEOPLE_SEARCH_PAGE_SIZE, offset },
    dbOverride
  );
  const totalCount = result.totalCount ?? 0;
  const totalPages = Math.min(
    MAX_PEOPLE_SEARCH_PAGES,
    Math.ceil(totalCount / PEOPLE_SEARCH_PAGE_SIZE)
  );

  // Keep valid but out-of-range page URLs useful instead of returning a false empty state.
  const resolvedPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
  if (resolvedPage !== page) {
    offset = (resolvedPage - 1) * PEOPLE_SEARCH_PAGE_SIZE;
    result = await searchPublicPeople(
      normalizedQuery,
      { limit: PEOPLE_SEARCH_PAGE_SIZE, offset },
      dbOverride
    );
  }

  return {
    items: result.items,
    totalCount,
    page: resolvedPage,
    pageSize: PEOPLE_SEARCH_PAGE_SIZE,
    totalPages,
    hasMore: (result.totalCount ?? 0) > MAX_PEOPLE_SEARCH_PAGES * PEOPLE_SEARCH_PAGE_SIZE,
  };
}

/** Small, deterministic public-profile suggestions for the live search field. */
export async function getPeopleSearchSuggestions(
  query: string,
  dbOverride?: DbInstance
): Promise<PublicPersonSearchRecord[]> {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  if (!isPeopleSearchQueryLongEnough(normalizedQuery)) return [];

  const result = await searchPublicPeople(
    normalizedQuery,
    { limit: PEOPLE_SEARCH_SUGGESTION_LIMIT, offset: 0, includeTotalCount: false },
    dbOverride
  );
  return result.items;
}
