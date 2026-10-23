import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';
import { shouldUseSecureCookies } from '../../config/cookiePolicy';

export interface FlashMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}

export const FLASH_COOKIE_NAME = 'tvd-flash';
const FLASH_COOKIE_TTL_MS = 10_000;
const MAX_FLASH_MESSAGE_LENGTH = 240;
const FLASH_SIGNING_CONTEXT = 'the-vinyl-drop:flash:v1';

/**
 * Sign flash payloads with a purpose-specific context so clients cannot forge
 * success feedback by editing a cookie or adding a query string.
 */
function signFlashPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', config.RECOVERY_SIGNING_SECRET)
    .update(`${FLASH_SIGNING_CONTEXT}:${encodedPayload}`)
    .digest('hex');
}

/**
 * Sets a short-lived, HTTP-only, signed cookie for a message created only after
 * the server-side action has completed successfully (or a server-selected error).
 */
export function setFlashCookie(
  res: Response,
  type: FlashMessage['type'],
  message: string
): void {
  const normalizedMessage = typeof message === 'string' ? message.trim().slice(0, MAX_FLASH_MESSAGE_LENGTH) : '';
  if (!normalizedMessage || !['success', 'error', 'info'].includes(type)) return;

  const payload = Buffer.from(
    JSON.stringify({
      type,
      message: normalizedMessage,
      expiresAt: Date.now() + FLASH_COOKIE_TTL_MS,
    }),
    'utf8'
  ).toString('base64url');
  const token = `${payload}.${signFlashPayload(payload)}`;

  res.cookie(FLASH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(config.NODE_ENV),
    sameSite: 'lax',
    maxAge: FLASH_COOKIE_TTL_MS,
    path: '/',
  });
}

function verifyFlashCookie(token: unknown): FlashMessage | null {
  if (typeof token !== 'string' || token.length > 2048) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const encodedPayload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(encodedPayload) || !/^[a-f0-9]{64}$/i.test(providedSignature)) {
    return null;
  }

  const expectedSignature = signFlashPayload(encodedPayload);
  if (
    !crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;

    const candidate = parsed as Partial<FlashMessage> & { expiresAt?: unknown };
    if (
      (candidate.type !== 'success' && candidate.type !== 'error' && candidate.type !== 'info') ||
      typeof candidate.message !== 'string' ||
      !candidate.message.trim() ||
      candidate.message.length > MAX_FLASH_MESSAGE_LENGTH ||
      typeof candidate.expiresAt !== 'number' ||
      !Number.isFinite(candidate.expiresAt) ||
      candidate.expiresAt < Date.now()
    ) {
      return null;
    }

    return { type: candidate.type, message: candidate.message.trim() };
  } catch {
    return null;
  }
}

/**
 * Reads a signed, short-lived flash cookie and consumes it after one request.
 * Query parameters are deliberately ignored: URLs are user-controlled and must
 * not be able to manufacture server-confirmed success or error messages.
 */
export function flashMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const cookieValue = req.cookies?.[FLASH_COOKIE_NAME];
  const message = verifyFlashCookie(cookieValue);

  res.locals.flashMessages = message ? [message] : [];

  if (cookieValue) {
    res.clearCookie(FLASH_COOKIE_NAME, {
      httpOnly: true,
      secure: shouldUseSecureCookies(config.NODE_ENV),
      sameSite: 'lax',
      path: '/',
    });
  }

  next();
}
