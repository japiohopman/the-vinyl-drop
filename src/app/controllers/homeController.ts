import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { buildHomeViewModel } from '../view-models/homeViewModel';

export function getHomePage(req: Request, res: Response, next: NextFunction): void {
  try {
    const data = homeService.getHomeData();
    const viewModel = buildHomeViewModel(data.welcomeMessage);
    res.render('home/index', viewModel);
  } catch (error) {
    next(error);
  }
}
