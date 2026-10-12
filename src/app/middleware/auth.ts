import { Request, Response, NextFunction } from 'express';
import { User, Session } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getUserFromToken, refreshSession } from '../services/authService';
import { getProfileById } from '../services/profileService';
import { Profile } from '../../db/schema/profiles';
import { config } from '../../config/env';

/**
 * Auth/session and recovery cookies are bearer credentials. Staging is public HTTPS too,
 * so only local development and tests may issue these cookies without the Secure flag.
 */
export function shouldUseSecureCookies(
  nodeEnv: typeof config.NODE_ENV = config.NODE_ENV
): boolean {
  return nodeEnv !== 'development' && nodeEnv !== 'test';
}

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
    secure: shouldUseSecureCookies(),
    sameSite: 'lax',
    maxAge: (session.expires_in || 3600) * 1000,
  });

  if (session.refresh_token) {
    res.cookie('sb-refresh-token', session.refresh_token, {
      httpOnly: true,
      secure: shouldUseSecureCookies(),
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

const RECOVERY_SECRET = config.RECOVERY_SIGNING_SECRET;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function generateRecoveryToken(userId: string): string {
  const expiresAt = Date.now() + RECOVERY_WINDOW_MS;
  const payload = `${userId}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', RECOVERY_SECRET).update(payload).digest('hex');
  return `${userId}.${expiresAt}.${signature}`;
}

export function verifyRecoveryToken(
  token: string | undefined | null,
  activeUserId: string | undefined | null
): boolean {
  if (!token || !activeUserId) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [userId, expiresAtStr, signature] = parts;
  if (userId !== activeUserId) return false;

  const expiresAt = Number(expiresAtStr);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

  const payload = `${userId}:${expiresAtStr}`;
  const expectedSignature = crypto.createHmac('sha256', RECOVERY_SECRET).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Helper to set short-lived cryptographically verified recovery session marker cookie
 */
export function setRecoveryCookie(res: Response, userId: string): void {
  const token = generateRecoveryToken(userId);
  res.cookie('sb-recovery-mode', token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: 'lax',
    maxAge: RECOVERY_WINDOW_MS,
  });
}

/**
 * Helper to clear recovery session marker cookie
 */
export function clearRecoveryCookie(res: Response): void {
  res.clearCookie('sb-recovery-mode');
}

/**
 * Helper to check if current request has a cryptographically verified recovery marker bound to req.user
 */
export function isRecoverySessionVerified(req: Request): boolean {
  if (!req.user) return false;
  const token = req.cookies?.['sb-recovery-mode'];
  return verifyRecoveryToken(token, req.user.id);
}

/**
 * Helper to clear session cookies
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('sb-access-token');
  res.clearCookie('sb-refresh-token');
  res.clearCookie('sb-recovery-mode');
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
