import { Request, Response, NextFunction } from 'express';

export interface FlashMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}

export const FLASH_COOKIE_NAME = 'tvd-flash';

/**
 * Sets a short-lived HTTP-only cookie containing a flash message for cross-redirect feedback.
 */
export function setFlashCookie(
  res: Response,
  type: 'success' | 'error' | 'info',
  message: string
): void {
  if (!message || !message.trim()) return;
  const payload: FlashMessage = { type, message: message.trim() };
  res.cookie(FLASH_COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    maxAge: 10000, // 10 seconds
    path: '/',
    sameSite: 'lax',
  });
}

/**
 * Middleware that inspects cookies, query parameters, and existing res.locals to populate
 * res.locals.flashMessages as a normalized array of FlashMessage objects.
 */
export function flashMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const messages: FlashMessage[] = [];

  // 1. Inspect and clear short-lived tvd-flash cookie
  if (req.cookies && req.cookies[FLASH_COOKIE_NAME]) {
    try {
      const parsed = JSON.parse(req.cookies[FLASH_COOKIE_NAME]);
      if (parsed && typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
        const type: 'success' | 'error' | 'info' =
          parsed.type === 'error' ? 'error' : parsed.type === 'info' ? 'info' : 'success';
        messages.push({ type, message: parsed.message.trim() });
      }
    } catch {
      // Malformed flash cookie; safely ignore
    }
    res.clearCookie(FLASH_COOKIE_NAME, { path: '/' });
  }

  // 2. Inspect query parameters for success, error, and flash
  if (typeof req.query.success === 'string' && req.query.success.trim().length > 0) {
    messages.push({ type: 'success', message: req.query.success.trim() });
  }
  if (typeof req.query.error === 'string' && req.query.error.trim().length > 0) {
    messages.push({ type: 'error', message: req.query.error.trim() });
  }
  if (typeof req.query.flash === 'string' && req.query.flash.trim().length > 0) {
    messages.push({ type: 'info', message: req.query.flash.trim() });
  }

  // 3. Preserve any pre-existing res.locals.flashMessages if set by controllers/middleware
  if (Array.isArray(res.locals.flashMessages)) {
    messages.push(...(res.locals.flashMessages as FlashMessage[]));
  }

  res.locals.flashMessages = messages;
  next();
}
