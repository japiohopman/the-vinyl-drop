import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { getRecentActivityFeed } from '../services/activityService';

export async function getActivityPage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const requestingUserId = req.user?.id;
    const events = await getRecentActivityFeed(requestingUserId);

    renderWithLayout(
      res,
      'activity/index',
      {
        title: 'Community Activity — The Vinyl Drop',
        events,
        error: null,
      },
      next
    );
  } catch (error) {
    try {
      res.status(500);
      return renderWithLayout(
        res,
        'activity/index',
        {
          title: 'Community Activity — The Vinyl Drop',
          events: [],
          error: 'Unable to load community activity. Please refresh or try again later.',
        },
        next
      );
    } catch {
      next(error);
    }
  }
}
