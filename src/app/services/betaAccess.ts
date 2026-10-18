import { Request, Response } from 'express';
import { config } from '../../config/env';
import { shouldUseSecureCookies } from '../../config/cookiePolicy';

export const BETA_WELCOME_COOKIE = 'tvd-beta-welcome';
export const BETA_WELCOME_SEEN_COOKIE = 'tvd-beta-welcome-seen';

export const INVITE_ONLY_ACCESS_MESSAGE =
  'The Vinyl Drop is invite-only during this early test. Only people who have been personally invited can create an account or use the beta. If you believe you were invited, check that you are using the email address you were invited with. There is no public waitlist.';

export const INVITE_ONLY_ACCESS_DENIED_MESSAGE =
  'This email does not currently have access to the private beta. If you believe you were invited, check that you are using the invited email address or contact us. There is no public waitlist.';

export function isBetaInviteOnlyEnabled(): boolean {
  return config.BETA_INVITE_ONLY_ENABLED;
}

export interface BetaAccessSettings {
  inviteOnlyEnabled: boolean;
  allowedEmails: string;
}

export function isBetaAllowedEmail(
  email?: string | null,
  settings: BetaAccessSettings = {
    inviteOnlyEnabled: config.BETA_INVITE_ONLY_ENABLED,
    allowedEmails: config.BETA_ALLOWED_EMAILS,
  }
): boolean {
  if (!settings.inviteOnlyEnabled) return true;

  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;

  const allowlist = settings.allowedEmails
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(normalizedEmail);
}

/**
 * Short-lived, one-use presentation flash only; this cookie grants no access.
 * App middleware clears it on the next HTML request after showing the banner.
 */
/**
 * Shows the welcome only once per browser. These cookies are presentation state,
 * never access credentials. The persistent marker is first-party, HTTP-only and
 * has a finite lifetime; document it in the privacy notice before inviting testers.
 */
export function setBetaWelcomeFlashCookie(req: Request, res: Response): void {
  if (!isBetaInviteOnlyEnabled() || req.cookies?.[BETA_WELCOME_SEEN_COOKIE] === '1') return;

  const cookieOptions = {
    httpOnly: true,
    secure: shouldUseSecureCookies(config.NODE_ENV),
    sameSite: 'lax' as const,
    path: '/',
  };

  res.cookie(BETA_WELCOME_SEEN_COOKIE, '1', {
    ...cookieOptions,
    maxAge: 180 * 24 * 60 * 60 * 1000,
  });
  res.cookie(BETA_WELCOME_COOKIE, '1', {
    ...cookieOptions,
    maxAge: 60 * 1000,
  });
}
