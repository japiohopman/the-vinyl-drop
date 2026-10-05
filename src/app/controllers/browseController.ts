import { Request, Response, NextFunction } from 'express';
import { searchBrowseListings } from '../services/listingService';
import { renderWithLayout } from '../utils/render';
import { ConditionGrade, CONDITION_GRADES } from '../../db/schema/enums';

function parseEuroQueryParamToCents(param?: unknown): number | undefined {
  if (typeof param !== 'string' || !param.trim()) return undefined;
  const num = parseFloat(param.trim());
  if (isNaN(num) || num < 0) return undefined;
  return Math.round(num * 100);
}

export async function getBrowsePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const genre = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
    const conditionInput = typeof req.query.condition === 'string' ? req.query.condition.trim() : '';
    const condition = (CONDITION_GRADES as readonly string[]).includes(conditionInput)
      ? (conditionInput as ConditionGrade)
      : undefined;

    const minPriceEurStr = typeof req.query.minPrice === 'string' ? req.query.minPrice.trim() : '';
    const maxPriceEurStr = typeof req.query.maxPrice === 'string' ? req.query.maxPrice.trim() : '';

    const minPrice = parseEuroQueryParamToCents(req.query.minPrice);
    const maxPrice = parseEuroQueryParamToCents(req.query.maxPrice);

    const sortInput = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'newest';
    const validSorts = ['newest', 'price_asc', 'price_desc', 'title_asc', 'artist_asc'];
    const sort = validSorts.includes(sortInput)
      ? (sortInput as 'newest' | 'price_asc' | 'price_desc' | 'title_asc' | 'artist_asc')
      : 'newest';

    const pageNum = parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
    const page = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;

    let results: Awaited<ReturnType<typeof searchBrowseListings>>;
    try {
      results = await searchBrowseListings({
        q: q || undefined,
        genre: genre || undefined,
        condition,
        minPrice,
        maxPrice,
        sort,
        page,
        limit: 12,
      });
    } catch {
      results = {
        items: [],
        totalCount: 0,
        page,
        limit: 12,
        totalPages: 1,
      };
    }

    renderWithLayout(
      res,
      'browse/index',
      {
        title: q ? `Search: "${q}" — The Vinyl Drop` : 'Browse Vinyl Records — The Vinyl Drop',
        listings: results.items,
        filters: {
          q,
          genre,
          condition: conditionInput,
          minPrice: minPriceEurStr,
          maxPrice: maxPriceEurStr,
          sort,
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
