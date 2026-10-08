import { Request, Response, NextFunction } from 'express';
import { addFavorite, removeFavorite } from '../services/favoriteService';
import { AuthorizationError, NotFoundError, ValidationError } from '../services/errors';

export async function postFavoriteListing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;

    try {
      await addFavorite(req.user.id, listingId);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404);
        return res.redirect(`/listings/${listingId}`);
      }
      if (err instanceof AuthorizationError || err instanceof ValidationError) {
        return res.redirect(`/listings/${listingId}`);
      }
      throw err;
    }

    const referer = req.get('Referer');
    if (referer && referer.includes(req.get('Host') || '')) {
      return res.redirect(referer);
    }
    return res.redirect(`/listings/${listingId}`);
  } catch (error) {
    next(error);
  }
}

export async function postUnfavoriteListing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    await removeFavorite(req.user.id, listingId);

    const referer = req.get('Referer');
    if (referer && referer.includes(req.get('Host') || '')) {
      return res.redirect(referer);
    }
    return res.redirect(`/listings/${listingId}`);
  } catch (error) {
    next(error);
  }
}
