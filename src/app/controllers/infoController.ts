import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';

const CONTACT_EMAIL = 'yepyouknowhim@gmail.com';

export function getContactPage(req: Request, res: Response, next: NextFunction): void {
  try {
    renderWithLayout(res, 'info/contact', {
      title: 'Contact Us — The Vinyl Drop',
      contactEmail: CONTACT_EMAIL,
    }, next);
  } catch (error) {
    next(error);
  }
}

export function getPrivacyNoticePage(req: Request, res: Response, next: NextFunction): void {
  try {
    renderWithLayout(res, 'info/privacy', {
      title: 'Privacy Notice — The Vinyl Drop',
      contactEmail: CONTACT_EMAIL,
      noticeStatus: 'draft',
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
