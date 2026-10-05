import { z } from 'zod';
import { config } from '../config/env';

export const usernameSchema = z
  .string()
  .min(3, { message: 'Username must be at least 3 characters long' })
  .max(30, { message: 'Username must not exceed 30 characters' })
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username may only contain letters, numbers, underscores, and hyphens',
  });

export const signUpSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
  username: usernameSchema,
  displayName: z.string().max(50, { message: 'Display name must not exceed 50 characters' }).optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export function isAllowedRedirectUrl(url: string | undefined | null): boolean {
  if (!url) return false;

  // Reject backslashes or control characters to prevent host escape / normalization tricks (e.g., /\\evil.com or /%5Cevil.com)
  const hasControlChars = url.split('').some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

  if (url.includes('\\') || hasControlChars) {
    return false;
  }

  // Allow relative URLs starting with / (e.g. /profile), but forbid scheme-relative // or /\\
  if (url.startsWith('/')) {
    if (url.startsWith('//') || url.startsWith('/\\')) {
      return false;
    }

    try {
      const baseOrigin = new URL(config.APP_BASE_URL).origin;
      const resolved = new URL(url, config.APP_BASE_URL);
      if (resolved.origin !== baseOrigin) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  try {
    const parsed = new URL(url);
    const allowedOrigins = [
      config.APP_BASE_URL,
      ...config.ALLOWED_REDIRECT_URLS.split(',').map((u) => u.trim()),
    ].map((u) => {
      try {
        return new URL(u).origin;
      } catch {
        return u;
      }
    });

    return allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
}

export function sanitizeRedirectUrl(url: string | undefined | null, fallback = '/'): string {
  if (url && isAllowedRedirectUrl(url)) {
    return url;
  }
  return fallback;
}
