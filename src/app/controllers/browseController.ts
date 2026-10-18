import { Request, Response, NextFunction } from 'express';
import { hasExplicitWhiteLabelInventory, searchBrowseListings } from '../services/listingService';
import { parseVinylFormatFilters, VINYL_FORMAT_FILTERS } from '../../domain/releaseFormat';
import { renderWithLayout } from '../utils/render';
import { ConditionGrade, CONDITION_GRADES } from '../../db/schema/enums';

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
    const genre = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
    const submittedFormats = parseVinylFormatFilters(req.query.format);
    const formatToggle = typeof req.query.formatToggle === 'string'
      ? parseVinylFormatFilters(req.query.formatToggle)[0]
      : undefined;
    const formats = formatToggle
      ? submittedFormats.includes(formatToggle)
        ? submittedFormats.filter((format) => format !== formatToggle)
        : [...submittedFormats, formatToggle]
      : submittedFormats;
    const whiteLabelToggle = req.query.whiteLabelToggle === '1';
    const whiteLabel = whiteLabelToggle ? req.query.whiteLabel !== '1' : req.query.whiteLabel === '1';
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
