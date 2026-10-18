import { Response } from 'express';
import { config } from '../../config/env';
import { shouldUseSecureCookies } from '../../config/cookiePolicy';

export const BETA_WELCOME_COOKIE = 'tvd-beta-welcome';

export const INVITE_ONLY_ACCESS_MESSAGE =
  'The Vinyl Drop is invite-only during this early test. Only people who have been personally invited can create an account or use the beta. If you believe you were invited, check that you are using the email address you were invited with. There is no public waitlist.';

export function isBetaInviteOnlyEnabled(): boolean {
  return config.BETA_INVITE_ONLY_ENABLED;
}

export function isBetaAllowedEmail(email?: string | null): boolean {
  if (!isBetaInviteOnlyEnabled()) return true;

  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;

  const allowlist = config.BETA_ALLOWED_EMAILS
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(normalizedEmail);
}

/**
 * Short-lived, one-use presentation flash only; this cookie grants no access.
 * App middleware clears it on the next HTML request after showing the banner.
 */
export function setBetaWelcomeFlashCookie(res: Response): void {
  if (!isBetaInviteOnlyEnabled()) return;

  res.cookie(BETA_WELCOME_COOKIE, '1', {
    httpOnly: true,
    secure: shouldUseSecureCookies(config.NODE_ENV),
    sameSite: 'lax',
    maxAge: 60 * 1000,
    path: '/',
  });
}
