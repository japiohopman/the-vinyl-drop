import { Request, Response, NextFunction } from 'express';
import { createHmac, randomBytes } from 'crypto';
import { z } from 'zod';
import { renderWithLayout } from '../utils/render';
import { TERMS_VERSION } from '../services/registrationConsent';
import { sendContactMessage } from '../services/contactMessageService';

const CONTACT_EMAIL = 'yepyouknowhim@gmail.com';
const CONTACT_COOLDOWN_MS = 60_000;
const MAX_CONTACT_RATE_KEYS = 2_000;
const contactRateLimitSecret = randomBytes(32);
const contactSubmissionTimes = new Map<string, number>();

const contactMessageSchema = z.object({
  name: z.string().trim().max(80, 'Name must be 80 characters or fewer.').optional().default(''),
  email: z.string().trim().min(1, 'Enter an email address.').max(254, 'Email address is too long.').email('Enter a valid email address.'),
  message: z.string().trim().min(10, 'Message must be at least 10 characters.').max(5_000, 'Message must be 5,000 characters or fewer.'),
  contactFaxNumber: z.string().max(0, 'Leave this field empty.').optional().default(''),
});

type ContactField = 'name' | 'email' | 'message';
type ContactFormValues = { name: string; email: string; message: string };
type ContactFormState = {
  values: ContactFormValues;
  fieldErrors: Partial<Record<ContactField, string>>;
  feedback?: { kind: 'success' | 'error'; message: string };
};

const emptyContactForm = (): ContactFormState => ({
  values: { name: '', email: '', message: '' },
  fieldErrors: {},
});

function renderContact(
  res: Response,
  next: NextFunction,
  statusCode: number,
  contactForm: ContactFormState,
): void {
  // Do not let a browser or intermediary cache personal contact-form fields.
  res.setHeader('Cache-Control', 'no-store');
  res.status(statusCode);
  renderWithLayout(res, 'info/contact', {
    title: 'Contact Us — The Vinyl Drop',
    contactEmail: CONTACT_EMAIL,
    contactForm,
  }, next);
}

/**
 * A low-volume, per-email cooldown with a process-random HMAC key.
 * It stores no raw email addresses and is supplemental to the form honeypot.
 * It is intentionally not treated as the site-wide abuse/rate-limit solution in #89.
 */
function claimContactCooldown(email: string, now = Date.now()): boolean {
  for (const [key, timestamp] of contactSubmissionTimes) {
    if (now - timestamp >= CONTACT_COOLDOWN_MS) contactSubmissionTimes.delete(key);
  }

  const key = createHmac('sha256', contactRateLimitSecret)
    .update(email.trim().toLowerCase())
    .digest('hex');
  const previous = contactSubmissionTimes.get(key);
  if (previous !== undefined && now - previous < CONTACT_COOLDOWN_MS) return false;

  if (contactSubmissionTimes.size >= MAX_CONTACT_RATE_KEYS) {
    const oldestKey = contactSubmissionTimes.keys().next().value as string | undefined;
    if (oldestKey) contactSubmissionTimes.delete(oldestKey);
  }
  contactSubmissionTimes.set(key, now);
  return true;
}

export function getContactPage(req: Request, res: Response, next: NextFunction): void {
  try {
    renderContact(res, next, 200, emptyContactForm());
  } catch (error) {
    next(error);
  }
}

export async function postContactMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const values: ContactFormValues = {
    name: typeof body.name === 'string' ? body.name : '',
    email: typeof body.email === 'string' ? body.email : '',
    message: typeof body.message === 'string' ? body.message : '',
  };

  // Reject automated submissions without pretending a message was sent.
  if (typeof body.contactFaxNumber === 'string' && body.contactFaxNumber.trim() !== '') {
    renderContact(res, next, 400, {
      values,
      fieldErrors: {},
      feedback: { kind: 'error', message: 'The form could not be accepted. Please leave the extra field empty or contact us by email.' },
    });
    return;
  }

  const parsed = contactMessageSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<ContactField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === 'name' || field === 'email' || field === 'message') && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    renderContact(res, next, 400, {
      values,
      fieldErrors,
      feedback: { kind: 'error', message: 'Please check the marked fields. Your message has not been submitted.' },
    });
    return;
  }

  if (!claimContactCooldown(parsed.data.email)) {
    renderContact(res, next, 429, {
      values,
      fieldErrors: {},
      feedback: { kind: 'error', message: 'Please wait about a minute before trying this email address again, or use the email link above.' },
    });
    return;
  }

  try {
    await sendContactMessage({
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message,
    });
    renderContact(res, next, 200, {
      values: { name: '', email: '', message: '' },
      fieldErrors: {},
      feedback: {
        kind: 'success',
        message: 'Your message was accepted by our email provider for sending. Delivery and response time are not guaranteed; please use the direct email above if you need to follow up.',
      },
    });
  } catch {
    // Provider/configuration details and message contents must never reach logs or the response.
    renderContact(res, next, 503, {
      values,
      fieldErrors: {},
      feedback: {
        kind: 'error',
        message: 'We could not confirm that your message was sent. The form does not store messages. Please try again later or use the direct email above.',
      },
    });
  }
}

export function getPrivacyNoticePage(req: Request, res: Response, next: NextFunction): void {
  try {
    renderWithLayout(res, 'info/privacy', {
      title: 'Privacy Notice — The Vinyl Drop',
      contactEmail: CONTACT_EMAIL,
      noticeStatus: 'current',
    }, next);
  } catch (error) {
    next(error);
  }
}

export function getTermsOfUsePage(req: Request, res: Response, next: NextFunction): void {
  try { renderWithLayout(res, 'info/terms', { title: 'Terms of Use — The Vinyl Drop', contactEmail: CONTACT_EMAIL, termsVersion: TERMS_VERSION }, next); }
  catch (error) { next(error); }
}

export function getCommunityRulesPage(req: Request, res: Response, next: NextFunction): void {
  try {
    renderWithLayout(res, 'info/community-rules', {
      title: 'Community Rules — The Vinyl Drop',
    }, next);
  } catch (error) {
    next(error);
  }
}
