import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';

export function getContactPage(req: Request, res: Response, next: NextFunction): void {
  try {
    renderWithLayout(res, 'info/contact', {
      title: 'Contact Us — The Vinyl Drop',
      contactEmail: 'yepyouknowhim@gmail.com',
    }, next);
  } catch (error) {
    next(error);
  }
}

export function getCommunityRulesPage(req: Request, res: Response, next: NextFunction): void {
  try {
    renderWithLayout(res, 'info/community-rules', {
      title: 'Community Rules — The Vinyl Drop',
    }, next);
  } catch (error) {
    next(error);
  }
}
