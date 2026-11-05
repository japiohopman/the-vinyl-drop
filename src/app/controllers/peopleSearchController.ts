import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import {
  getPeopleSearchSuggestions,
  isPeopleSearchQueryLongEnough,
  MAX_PEOPLE_SEARCH_QUERY_LENGTH,
  MAX_PEOPLE_SEARCH_PAGES,
  searchPeople,
} from '../services/peopleSearchService';

function isMalformedPeopleQuery(query: unknown): boolean {
  return typeof query !== 'string' ||
    query.length > MAX_PEOPLE_SEARCH_QUERY_LENGTH ||
    [...query].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
}

function parsePage(value: unknown): number | null {
  if (value === undefined || value === null) return 1;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) return null;

  const page = Number(value.trim());
  if (!Number.isSafeInteger(page) || page > MAX_PEOPLE_SEARCH_PAGES) return null;
  return page;
}

export async function getPeopleSearchPage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawQuery = req.query.q;
    const query = rawQuery === undefined ? '' : rawQuery;
    const requestedPage = parsePage(req.query.page);

    if (isMalformedPeopleQuery(query) || requestedPage === null) {
      res.status(400);
      renderWithLayout(res, 'people/index', {
        title: 'Find People — The Vinyl Drop',
        query: typeof query === 'string' ? query.trim() : '',
        people: [],
        pagination: { totalCount: 0, page: 1, pageSize: 12, totalPages: 0, hasMore: false },
        errorMessage: 'Enter a valid search of up to 50 characters and a valid results page.',
      }, next);
      return;
    }

    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    const results = isPeopleSearchQueryLongEnough(trimmedQuery)
      ? await searchPeople(trimmedQuery, requestedPage)
      : { items: [], totalCount: 0, page: 1, pageSize: 12, totalPages: 0, hasMore: false };

    res.set('Cache-Control', 'no-store');
    renderWithLayout(res, 'people/index', {
      title: trimmedQuery
        ? `People matching “${trimmedQuery}” — The Vinyl Drop`
        : 'Find People — The Vinyl Drop',
      query: trimmedQuery,
      people: results.items,
      pagination: {
        totalCount: results.totalCount,
        page: results.page,
        pageSize: results.pageSize,
        totalPages: results.totalPages,
        hasMore: results.hasMore,
      },
    }, next);
  } catch (error) {
    next(error);
  }
}

/** Return only public profile identity fields for the live People search suggestions. */
export async function getPeopleSuggestions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query.q;
    res.set('Cache-Control', 'no-store');

    if (typeof query !== 'string' || isMalformedPeopleQuery(query)) {
      res.status(400).json({ error: 'Provide a search query of at most 50 characters.' });
      return;
    }

    const trimmedQuery = query.trim();
    if (!isPeopleSearchQueryLongEnough(trimmedQuery)) {
      res.status(200).json({ suggestions: [] });
      return;
    }

    const suggestions = await getPeopleSearchSuggestions(trimmedQuery);
    res.status(200).json({ suggestions });
  } catch (error) {
    next(error);
  }
}
