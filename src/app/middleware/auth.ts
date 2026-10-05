import { Request, Response, NextFunction } from 'express';
import { User, Session } from '@supabase/supabase-js';
import { getUserFromToken, refreshSession } from '../services/authService';
import { getProfileById } from '../services/profileService';
import { Profile } from '../../db/schema/profiles';
import { config } from '../../config/env';

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
 * Helper to write session tokens to response cookies
 */
export function setAuthCookies(res: Response, session: Session): void {
  res.cookie('sb-access-token', session.access_token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: (session.expires_in || 3600) * 1000,
  });

  if (session.refresh_token) {
    res.cookie('sb-refresh-token', session.refresh_token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

/**
 * Helper to clear session cookies
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('sb-access-token');
  res.clearCookie('sb-refresh-token');
}

/**
 * Extracts session/user from cookies or authorization header and attaches to req and res.locals.
 * Automatically performs server-side session refresh if access token is expired or missing
 * but a valid refresh token exists in cookies.
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

    const refreshToken = req.cookies?.['sb-refresh-token'];

    let activeUser: User | null = null;

    if (accessToken) {
      activeUser = await getUserFromToken(accessToken);
    }

    // Server-side session refresh path if access token is invalid/expired but refresh token is present
    if (!activeUser && refreshToken) {
      const refreshResult = await refreshSession(refreshToken);
      if (refreshResult.user && refreshResult.session) {
        activeUser = refreshResult.user;
        req.session = refreshResult.session;
        // Rotate and rewrite access and refresh cookies
        setAuthCookies(res, refreshResult.session);
      }
    }

    if (activeUser) {
      req.user = activeUser;
      res.locals.currentUser = activeUser;

      const profile = await getProfileById(activeUser.id);
      if (profile) {
        req.profile = profile;
        res.locals.currentProfile = profile;
      }
    }
  } catch {
    // If session extraction or refresh fails, clear locals and continue unauthenticated
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
        res.status(403);
        res.render('errors/500', {
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
