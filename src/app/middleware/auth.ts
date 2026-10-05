import { Request, Response, NextFunction } from 'express';
import { User, Session } from '@supabase/supabase-js';
import { getUserFromToken } from '../services/authService';
import { getProfileById } from '../services/profileService';
import { Profile } from '../../db/schema/profiles';

// Extend Express Request type
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: User | null;
      session?: Session | null;
      profile?: Profile | null;
    }
  }
}

/**
 * Extracts session/user from cookies or authorization header and attaches to req and res.locals.
 */
export async function sessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const accessToken =
      req.cookies?.['sb-access-token'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (accessToken) {
      const user = await getUserFromToken(accessToken);
      if (user) {
        req.user = user;
        res.locals.currentUser = user;

        const profile = await getProfileById(user.id);
        if (profile) {
          req.profile = profile;
          res.locals.currentProfile = profile;
        }
      }
    }
  } catch {
    // If session extraction fails, clear locals and continue unauthenticated
    req.user = null;
    req.profile = null;
    res.locals.currentUser = null;
    res.locals.currentProfile = null;
  }

  next();
}

/**
 * Middleware ensuring user is authenticated before accessing protected routes.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    const isJson = req.xhr || req.headers.accept?.includes('application/json');
    if (isJson) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const returnUrl = encodeURIComponent(req.originalUrl || '/');
    res.redirect(`/auth/login?next=${returnUrl}`);
    return;
  }
  next();
}

/**
 * Server-side ownership verification middleware.
 * Verifies that req.user.id matches the owner ID extracted from the request.
 */
export function requireOwnership(getOwnerId: (req: Request) => Promise<string | null> | string | null) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      const isJson = req.xhr || req.headers.accept?.includes('application/json');
      if (isJson) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.redirect('/auth/login');
      return;
    }

    try {
      const ownerId = await getOwnerId(req);
      if (!ownerId || req.user.id !== ownerId) {
        const isJson = req.xhr || req.headers.accept?.includes('application/json');
        if (isJson) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        res.status(403).render('errors/500', {
          title: '403 Forbidden',
          message: 'You do not have permission to access or modify this resource.',
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
