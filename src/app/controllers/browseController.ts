import { Request, Response, NextFunction } from 'express';
import {
  DIG_LISTINGS_PRELOAD_LIMIT,
  hasExplicitWhiteLabelInventory,
  searchBrowseListings,
  searchDigListings,
} from '../services/listingService';
import { parseVinylFormatFilters, resolveWhiteLabelFilter, toggleVinylFormatFilter, VINYL_FORMAT_FILTERS } from '../../domain/releaseFormat';
import { renderWithLayout } from '../utils/render';
import { ConditionGrade, CONDITION_GRADES } from '../../db/schema/enums';
import { RELEASE_GENRES, resolveCanonicalGenre } from '../../domain/releaseMetadata';

function parseEuroQueryParamToCentsStrict(param?: unknown): number | undefined | null {
  if (param === undefined || param === null) return undefined;
  if (typeof param !== 'string') return null; // malformed non-string
  const trimmed = param.trim();
  if (!trimmed) return undefined;

  // Must strictly match non-negative decimal currency pattern e.g. 10, 10.5, 10.50
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null; // invalid format
  }

  const num = Number(trimmed);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

function parsePageQueryParamStrict(param?: unknown): number | null {
  if (param === undefined || param === null) return 1;
  if (typeof param !== 'string') return null;
  const trimmed = param.trim();
  if (!trimmed) return 1;

  // Must strictly match positive integer string (no leading zeroes, no decimals, no trailing characters)
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  const num = Number(trimmed);
  return num > 0 ? num : null;
}

export async function getBrowsePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const genreInput = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
    const genre = genreInput ? (resolveCanonicalGenre(genreInput) || genreInput) : '';
    const submittedFormats = parseVinylFormatFilters(req.query.format);
    const formatToggle = typeof req.query.formatToggle === 'string'
      ? parseVinylFormatFilters(req.query.formatToggle)[0]
      : undefined;
    const formats = formatToggle
      ? toggleVinylFormatFilter(submittedFormats, formatToggle)
      : submittedFormats;
    const whiteLabelToggle = req.query.whiteLabelToggle === '1';
    const whiteLabel = resolveWhiteLabelFilter(req.query.whiteLabel, whiteLabelToggle);
    const conditionInput = typeof req.query.condition === 'string' ? req.query.condition.trim() : '';
    const condition = (CONDITION_GRADES as readonly string[]).includes(conditionInput)
      ? (conditionInput as ConditionGrade)
      : undefined;

    const minPriceEurStr = typeof req.query.minPrice === 'string' ? req.query.minPrice.trim() : '';
    const maxPriceEurStr = typeof req.query.maxPrice === 'string' ? req.query.maxPrice.trim() : '';

    const minPrice = parseEuroQueryParamToCentsStrict(req.query.minPrice);
    const maxPrice = parseEuroQueryParamToCentsStrict(req.query.maxPrice);
    const parsedPage = parsePageQueryParamStrict(req.query.page);
    const page = formatToggle || whiteLabelToggle ? 1 : parsedPage;
    const whiteLabelAvailable = await hasExplicitWhiteLabelInventory();

    const viewInput = typeof req.query.view === 'string' ? req.query.view.trim().toLowerCase() : 'grid';
    const view = viewInput === 'list' ? 'list' : 'grid';

    if (minPrice === null || maxPrice === null || page === null) {
      res.status(400);
      renderWithLayout(
        res,
        'browse/index',
        {
          title: 'Invalid Query Parameters — The Vinyl Drop',
          listings: [],
          filters: {
            q,
            genre,
            condition: conditionInput,
            minPrice: minPriceEurStr,
            maxPrice: maxPriceEurStr,
            sort: 'newest',
            view,
            formats,
            whiteLabel,
          },
          pagination: {
            totalCount: 0,
            page: 1,
            limit: 12,
            totalPages: 1,
          },
          errorMessage: 'Invalid search filter or page parameters provided.',
          formatOptions: VINYL_FORMAT_FILTERS,
          genreOptions: RELEASE_GENRES,
          whiteLabelAvailable,
        },
        next
      );
      return;
    }

    const sortInput = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'newest';
    const validSorts = ['newest', 'price_asc', 'price_desc', 'title_asc', 'artist_asc'];
    const sort = validSorts.includes(sortInput)
      ? (sortInput as 'newest' | 'price_asc' | 'price_desc' | 'title_asc' | 'artist_asc')
      : 'newest';

    const results = await searchBrowseListings({
      q: q || undefined,
      genre: genre || undefined,
      condition,
      minPrice,
      maxPrice,
      formats,
      whiteLabel,
      sort,
      page,
      limit: 12,
    });

    renderWithLayout(
      res,
      'browse/index',
      {
        title: q ? `Search: "${q}" — The Vinyl Drop` : 'Browse Vinyl Records — The Vinyl Drop',
        listings: results.items,
        formatOptions: VINYL_FORMAT_FILTERS,
          genreOptions: RELEASE_GENRES,
        whiteLabelAvailable,
        filters: {
          q,
          genre,
          condition: conditionInput,
          minPrice: minPriceEurStr,
          maxPrice: maxPriceEurStr,
          sort,
          view,
          formats,
          whiteLabel,
        },
        pagination: {
          totalCount: results.totalCount,
          page: results.page,
          limit: results.limit,
          totalPages: results.totalPages,
        },
      },
      next
    );
  } catch (error) {
    next(error);
  }
}

export async function getSearchPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  return getBrowsePage(req, res, next);
}


export async function getDigBrowsePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const genreInput = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
    const genre = genreInput ? (resolveCanonicalGenre(genreInput) || genreInput) : '';
    const formats = parseVinylFormatFilters(req.query.format);
    const whiteLabel = resolveWhiteLabelFilter(req.query.whiteLabel, false);
    const conditionInput = typeof req.query.condition === 'string' ? req.query.condition.trim() : '';
    const condition = (CONDITION_GRADES as readonly string[]).includes(conditionInput)
      ? (conditionInput as ConditionGrade)
      : undefined;
    const minPriceEurStr = typeof req.query.minPrice === 'string' ? req.query.minPrice.trim() : '';
    const maxPriceEurStr = typeof req.query.maxPrice === 'string' ? req.query.maxPrice.trim() : '';
    const minPrice = parseEuroQueryParamToCentsStrict(req.query.minPrice);
    const maxPrice = parseEuroQueryParamToCentsStrict(req.query.maxPrice);
    const sortInput = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'newest';
    const validSorts = ['newest', 'price_asc', 'price_desc', 'title_asc', 'artist_asc'];
    const sort = validSorts.includes(sortInput)
      ? (sortInput as 'newest' | 'price_asc' | 'price_desc' | 'title_asc' | 'artist_asc')
      : 'newest';
    const filters = { q, genre, condition: conditionInput, minPrice: minPriceEurStr, maxPrice: maxPriceEurStr, sort, formats, whiteLabel, view: 'dig' };

    if (minPrice === null || maxPrice === null) {
      res.status(400);
      renderWithLayout(res, 'browse/dig', {
        title: 'Invalid Filters — The Vinyl Drop Dig',
        items: [],
        totalCount: 0,
        hasMore: false,
        filters,
        genreOptions: RELEASE_GENRES,
        errorMessage: 'Invalid price filter. Use a non-negative amount such as 10 or 10.50.',
      }, next);
      return;
    }

    const result = await searchDigListings({
      q: q || undefined,
      genre: genre || undefined,
      condition,
      minPrice,
      maxPrice,
      formats,
      whiteLabel,
      sort,
      page: 1,
      limit: 100,
    });

    renderWithLayout(res, 'browse/dig', {
      title: 'Crate Dig — The Vinyl Drop',
      items: result.items,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
      filters,
      genreOptions: RELEASE_GENRES,
    }, next);
  } catch (error) {
    next(error);
  }
}

/**
 * Canonical Dig page. Search/filter semantics are shared with the regular
 * paginated listing view; the page renders the grid on desktop and the existing
 * crate-dig interaction on narrow screens.
 */
export async function getResponsiveDigPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const genreInput = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
    const genre = genreInput ? (resolveCanonicalGenre(genreInput) || genreInput) : '';
    const submittedFormats = parseVinylFormatFilters(req.query.format);
    const formatToggle = typeof req.query.formatToggle === 'string'
      ? parseVinylFormatFilters(req.query.formatToggle)[0]
      : undefined;
    const formats = formatToggle
      ? toggleVinylFormatFilter(submittedFormats, formatToggle)
      : submittedFormats;
    const whiteLabelToggle = req.query.whiteLabelToggle === '1';
    const whiteLabel = resolveWhiteLabelFilter(req.query.whiteLabel, whiteLabelToggle);
    const conditionInput = typeof req.query.condition === 'string' ? req.query.condition.trim() : '';
    const condition = (CONDITION_GRADES as readonly string[]).includes(conditionInput)
      ? (conditionInput as ConditionGrade)
      : undefined;

    const minPriceEurStr = typeof req.query.minPrice === 'string' ? req.query.minPrice.trim() : '';
    const maxPriceEurStr = typeof req.query.maxPrice === 'string' ? req.query.maxPrice.trim() : '';
    const minPrice = parseEuroQueryParamToCentsStrict(req.query.minPrice);
    const maxPrice = parseEuroQueryParamToCentsStrict(req.query.maxPrice);
    const parsedPage = parsePageQueryParamStrict(req.query.page);
    const page = formatToggle || whiteLabelToggle ? 1 : parsedPage;
    const whiteLabelAvailable = await hasExplicitWhiteLabelInventory();

    const viewInput = typeof req.query.view === 'string' ? req.query.view.trim().toLowerCase() : 'grid';
    const view = viewInput === 'list' ? 'list' : 'grid';
    const sortInput = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'newest';
    const validSorts = ['newest', 'price_asc', 'price_desc', 'title_asc', 'artist_asc'];
    const sort = validSorts.includes(sortInput)
      ? (sortInput as 'newest' | 'price_asc' | 'price_desc' | 'title_asc' | 'artist_asc')
      : 'newest';
    const filters = {
      q,
      genre,
      condition: conditionInput,
      minPrice: minPriceEurStr,
      maxPrice: maxPriceEurStr,
      sort,
      view,
      formats,
      whiteLabel,
    };

    if (minPrice === null || maxPrice === null || page === null) {
      res.status(400);
      renderWithLayout(res, 'browse/responsive-dig', {
        title: 'Invalid Search Filters — The Vinyl Drop',
        listings: [],
        formatOptions: VINYL_FORMAT_FILTERS,
          genreOptions: RELEASE_GENRES,
        whiteLabelAvailable,
        filters,
        pagination: { totalCount: 0, page: 1, limit: 12, totalPages: 1 },
        items: [],
        totalCount: 0,
        hasMore: false,
        responsiveDig: true,
        errorMessage: 'Invalid search filter or page parameters provided.',
      }, next);
      return;
    }

    const searchParams = {
      q: q || undefined,
      genre: genre || undefined,
      condition,
      minPrice,
      maxPrice,
      formats,
      whiteLabel,
      sort,
    };

    // One Dig result set feeds both presentations for the first 100 records.
    // The desktop grid is a 12-record slice of that same ordered set, avoiding a
    // second count + listing-row + primary-photo query on the common page path.
    const digResults = await searchDigListings(searchParams);
    const desktopPageLimit = 12;
    const lastReusableDigPage = Math.ceil(DIG_LISTINGS_PRELOAD_LIMIT / desktopPageLimit);
    const gridResults = page <= lastReusableDigPage
      ? {
          items: digResults.items.slice((page - 1) * desktopPageLimit, page * desktopPageLimit),
          totalCount: digResults.totalCount,
          page,
          limit: desktopPageLimit,
          totalPages: Math.ceil(digResults.totalCount / desktopPageLimit) || 1,
        }
      : await searchBrowseListings({ ...searchParams, page, limit: desktopPageLimit });

    renderWithLayout(res, 'browse/responsive-dig', {
      title: q ? `Search: "${q}" — Dig — The Vinyl Drop` : 'Dig — The Vinyl Drop',
      listings: gridResults.items,
      formatOptions: VINYL_FORMAT_FILTERS,
          genreOptions: RELEASE_GENRES,
      whiteLabelAvailable,
      filters,
      pagination: {
        totalCount: gridResults.totalCount,
        page: gridResults.page,
        limit: gridResults.limit,
        totalPages: gridResults.totalPages,
      },
      items: digResults.items,
      totalCount: digResults.totalCount,
      hasMore: digResults.hasMore,
      errorMessage: null,
      responsiveDig: true,
    }, next);
  } catch (error) {
    next(error);
  }
}
