import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { buildHomeViewModel } from '../view-models/homeViewModel';
import { renderWithLayout } from '../utils/render';

export function getHomePage(req: Request, res: Response, next: NextFunction): void {
  try {
    const data = homeService.getHomeData();
    const viewModel = buildHomeViewModel(data.welcomeMessage);
    renderWithLayout(res, 'home/index', viewModel);
  } catch (error) {
    next(error);
  }
}
