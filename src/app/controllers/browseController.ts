import { Request, Response, NextFunction } from 'express';
import { getRecentPublishedListings } from '../services/listingService';
import { buildListingCardFromDetails } from '../view-models/listingCardViewModel';
import { renderWithLayout } from '../utils/render';

export async function getBrowsePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let browseListings: ReturnType<typeof buildListingCardFromDetails>[] = [];
    try {
      const listingsDetails = await getRecentPublishedListings(50);
      browseListings = listingsDetails.map((details) => buildListingCardFromDetails(details));
    } catch {
      browseListings = [];
    }

    renderWithLayout(res, 'browse/index', {
      title: 'Browse Vinyl - The Vinyl Drop',
      listings: browseListings,
    }, next);
  } catch (error) {
    next(error);
  }
}
