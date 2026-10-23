import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';
import { shouldUseSecureCookies } from '../../config/cookiePolicy';

export interface FlashMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}

export const FLASH_COOKIE_NAME = 'tvd-flash';
const FLASH_SECRET = config.RECOVERY_SIGNING_SECRET || 'fallback-secret-for-flash-messages';
// Domain-separate flash signatures from other HMAC uses of the shared server secret.
const FLASH_SIGNING_CONTEXT = 'the-vinyl-drop:tvd-flash:v1:';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_COOKIE_LENGTH = 4096;
const ALLOWED_TYPES: Set<string> = new Set(['success', 'error', 'info']);

/** Signs the serialized payload with a flash-specific HMAC context. */
function signFlashPayload(payloadStr: string): string {
  const hmac = crypto
    .createHmac('sha256', FLASH_SECRET)
    .update(FLASH_SIGNING_CONTEXT)
    .update(payloadStr)
    .digest('hex');
  return `${payloadStr}.${hmac}`;
}

/** Verifies a cookie's signature and validates its schema, expiry, and size. */
export function verifyAndParseFlashCookie(cookieVal: string): FlashMessage | null {
  if (!cookieVal || typeof cookieVal !== 'string') return null;
  if (cookieVal.length > MAX_COOKIE_LENGTH) return null;

  const lastDot = cookieVal.lastIndexOf('.');
  if (lastDot === -1) return null;

  const payloadStr = cookieVal.slice(0, lastDot);
  const signature = cookieVal.slice(lastDot + 1);

  if (!signature || !payloadStr) return null;

  const expectedHmac = crypto
    .createHmac('sha256', FLASH_SECRET)
    .update(FLASH_SIGNING_CONTEXT)
    .update(payloadStr)
    .digest('hex');
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
    if (parsed.message.length > MAX_MESSAGE_LENGTH) return null;

    if (!parsed.type || !ALLOWED_TYPES.has(parsed.type)) return null;

    if (
      typeof parsed.expiresAt !== 'number' ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      type: parsed.type as 'success' | 'error' | 'info',
      message: parsed.message.trim(),
    };
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
  if (!ALLOWED_TYPES.has(type)) return;

  const trimmedMessage = message.trim();
  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) return;

  const payload = {
    type,
    message: trimmedMessage,
    expiresAt: Date.now() + 15000, // 15 seconds
  };
  const signed = signFlashPayload(JSON.stringify(payload));
  if (signed.length > MAX_COOKIE_LENGTH) return;

  res.cookie(FLASH_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: shouldUseSecureCookies(config.NODE_ENV),
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
