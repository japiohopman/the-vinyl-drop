import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { getHomeFeedListings } from '../services/listingService';
import { renderWithLayout } from '../utils/render';

export async function getHomePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = homeService.getHomeData();
    const listings = await getHomeFeedListings(6);

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
