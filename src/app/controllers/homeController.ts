import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { getHomeFeedListings } from '../services/listingService';
import { renderWithLayout } from '../utils/render';

export async function getHomePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = homeService.getHomeData();
    let listings: Awaited<ReturnType<typeof getHomeFeedListings>> = [];

    try {
      listings = await getHomeFeedListings(6);
    } catch (err) {
      if (err instanceof Error && err.message.includes('DATABASE_URL environment variable is missing')) {
        listings = [];
      } else {
        throw err;
      }
    }

    renderWithLayout(
      res,
      'home/index',
      {
        title: 'The Vinyl Drop — Local Vinyl Record Marketplace',
        message: data.welcomeMessage,
        listings,
      },
      next
    );
  } catch (error) {
    next(error);
  }
}
