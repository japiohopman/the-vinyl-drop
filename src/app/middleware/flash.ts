import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';

export interface FlashMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}

export const FLASH_COOKIE_NAME = 'tvd-flash';
const FLASH_SECRET = config.RECOVERY_SIGNING_SECRET || 'fallback-secret-for-flash-messages';

function signFlashPayload(payloadStr: string): string {
  const hmac = crypto.createHmac('sha256', FLASH_SECRET).update(payloadStr).digest('hex');
  return `${payloadStr}.${hmac}`;
}

function verifyAndParseFlashCookie(cookieVal: string): FlashMessage | null {
  if (!cookieVal || typeof cookieVal !== 'string') return null;
  const lastDot = cookieVal.lastIndexOf('.');
  if (lastDot === -1) return null;

  const payloadStr = cookieVal.slice(0, lastDot);
  const signature = cookieVal.slice(lastDot + 1);

  if (!signature || !payloadStr) return null;

  const expectedHmac = crypto.createHmac('sha256', FLASH_SECRET).update(payloadStr).digest('hex');
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedHmac, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadStr);
    if (!parsed || typeof parsed.message !== 'string' || !parsed.message.trim()) return null;
    if (parsed.expiresAt && typeof parsed.expiresAt === 'number' && Date.now() > parsed.expiresAt) {
      return null;
    }

    const type: 'success' | 'error' | 'info' =
      parsed.type === 'error' ? 'error' : parsed.type === 'info' ? 'info' : 'success';

    return { type, message: parsed.message.trim() };
  } catch {
    return null;
  }
}

/**
 * Sets a short-lived cryptographically signed HTTP-only cookie containing a flash message.
 */
export function setFlashCookie(
  res: Response,
  type: 'success' | 'error' | 'info',
  message: string
): void {
  if (!message || !message.trim()) return;
  const payload = {
    type,
    message: message.trim(),
    expiresAt: Date.now() + 15000, // 15 seconds
  };
  const signed = signFlashPayload(JSON.stringify(payload));
  res.cookie(FLASH_COOKIE_NAME, signed, {
    httpOnly: true,
    maxAge: 15000,
    path: '/',
    sameSite: 'lax',
  });
}

/**
 * Middleware that inspects and consumes signed tvd-flash cookies to populate
 * res.locals.flashMessages as a normalized array of FlashMessage objects.
 * Unverified URL query parameters are strictly ignored.
 */
export function flashMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const messages: FlashMessage[] = [];

  // 1. Inspect and clear short-lived signed tvd-flash cookie
  if (req.cookies && req.cookies[FLASH_COOKIE_NAME]) {
    const verified = verifyAndParseFlashCookie(req.cookies[FLASH_COOKIE_NAME]);
    if (verified) {
      messages.push(verified);
    }
    res.clearCookie(FLASH_COOKIE_NAME, { path: '/' });
  }

  // 2. Preserve any pre-existing res.locals.flashMessages if set by controllers
  if (Array.isArray(res.locals.flashMessages)) {
    messages.push(...(res.locals.flashMessages as FlashMessage[]));
  }

  res.locals.flashMessages = messages;
  next();
}
