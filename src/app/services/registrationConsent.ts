import crypto from 'crypto';
import { Request, Response } from 'express';
import { config } from '../../config/env';
import { shouldUseSecureCookies } from '../../config/cookiePolicy';

export const TERMS_VERSION = 'beta-terms-2026-10-19-v2';
export const REGISTRATION_CONSENT_COOKIE = 'tvd-registration-consent';
const CONSENT_TICKET_TTL_MS = 10 * 60 * 1000;

export interface RegistrationConsentRecord { termsVersion: string; termsAcceptedAt: string; ageAttestedAt: string; }
interface SignedConsentTicket { issuedAt: number; consent: RegistrationConsentRecord; }

function sign(payload: string): string { return crypto.createHmac('sha256', config.RECOVERY_SIGNING_SECRET).update(payload).digest('base64url'); }

export function createRegistrationConsentRecord(now = new Date()): RegistrationConsentRecord { const acceptedAt = now.toISOString(); return { termsVersion: TERMS_VERSION, termsAcceptedAt: acceptedAt, ageAttestedAt: acceptedAt }; }

/** Signed, short-lived ticket carries checkbox acceptance through OAuth; it does not grant beta access. */
export function setRegistrationConsentCookie(res: Response, consent: RegistrationConsentRecord): void {
  const payload = Buffer.from(JSON.stringify({ issuedAt: Date.now(), consent } satisfies SignedConsentTicket)).toString('base64url');
  res.cookie(REGISTRATION_CONSENT_COOKIE, payload + '.' + sign(payload), { httpOnly: true, secure: shouldUseSecureCookies(config.NODE_ENV), sameSite: 'lax', path: '/', maxAge: CONSENT_TICKET_TTL_MS });
}

export function getRegistrationConsentFromRequest(req: Request): RegistrationConsentRecord | null {
  const token = req.cookies?.[REGISTRATION_CONSENT_COOKIE]; if (typeof token !== 'string') return null;
  const parts = token.split('.'); if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const payload = parts[0], supplied = Buffer.from(parts[1]), expected = Buffer.from(sign(payload));
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SignedConsentTicket, now = Date.now();
    if (!Number.isFinite(ticket.issuedAt) || ticket.issuedAt > now + 30000 || now - ticket.issuedAt > CONSENT_TICKET_TTL_MS) return null;
    if (!ticket.consent || ticket.consent.termsVersion !== TERMS_VERSION) return null;
    const termsTime = Date.parse(ticket.consent.termsAcceptedAt), ageTime = Date.parse(ticket.consent.ageAttestedAt);
    if (!Number.isFinite(termsTime) || !Number.isFinite(ageTime) || Math.abs(termsTime - ticket.issuedAt) > 30000 || Math.abs(ageTime - ticket.issuedAt) > 30000) return null;
    return { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date(termsTime).toISOString(), ageAttestedAt: new Date(ageTime).toISOString() };
  } catch { return null; }
}

export function clearRegistrationConsentCookie(res: Response): void { res.clearCookie(REGISTRATION_CONSENT_COOKIE, { path: '/' }); }
