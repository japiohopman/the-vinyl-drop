import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { getRecentPublishedListings } from '../services/listingService';
import { buildListingCardFromDetails } from '../view-models/listingCardViewModel';
import { buildHomeViewModel } from '../view-models/homeViewModel';
import { renderWithLayout } from '../utils/render';

export async function getHomePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = homeService.getHomeData();
    const recentDropsDetails = await getRecentPublishedListings(6);
    const recentDrops = recentDropsDetails.map((details) => buildListingCardFromDetails(details));
    const viewModel = buildHomeViewModel(data.welcomeMessage, recentDrops);
    renderWithLayout(res, 'home/index', viewModel);
  } catch (error) {
    next(error);
  }
}
