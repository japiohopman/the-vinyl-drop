import { Request, Response, NextFunction } from 'express';
import { getCatalogueSearchSuggestions } from '../services/catalogueSearchService';
import { MAX_CATALOGUE_SEARCH_QUERY_LENGTH, normalizeCatalogueSearchQuery } from '../utils/catalogueSearch';

/** Serve bounded, public-only catalogue suggestions for Browse and Dig. */
export async function getCatalogueSuggestions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query.q;
    res.set('Cache-Control', 'no-store');

    if (
      typeof query !== 'string' ||
      query.length > MAX_CATALOGUE_SEARCH_QUERY_LENGTH ||
      [...query].some((character) => {
        const code = character.charCodeAt(0);
        return code < 0x20 || code === 0x7f;
      })
    ) {
      res.status(400).json({ error: 'Provide a search query of at most 80 characters.' });
      return;
    }

    const trimmed = query.trim();
    if (Array.from(normalizeCatalogueSearchQuery(trimmed)).length < 2) {
      res.status(200).json({ suggestions: [] });
      return;
    }

    const suggestions = await getCatalogueSearchSuggestions(trimmed);
    res.status(200).json({ suggestions });
  } catch (error) {
    next(error);
  }
}
