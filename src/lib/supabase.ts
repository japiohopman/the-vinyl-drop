import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { Request, Response } from 'express';
import { config } from '../config/env';
import { shouldUseSecureCookies } from '../config/cookiePolicy';

// Polyfill global WebSocket if missing in Node < 22 runtime environments
if (typeof globalThis.WebSocket === 'undefined') {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (globalThis as any).WebSocket = WebSocket;
}

export function createExpressSupabaseClient(
  req?: Request,
  res?: Response,
  accessToken?: string
): SupabaseClient {
  // Supabase Auth uses the same storage interface for both the PKCE verifier
  // and its session. The app owns its long-lived session cookies separately,
  // so retain ordinary auth state only for this request while persisting just
  // the short-lived PKCE keys across the OAuth redirect.
  const requestStorage = new Map<string, string>();
  const isPkceStorageKey = (key: string): boolean => key.endsWith('-code-verifier');

  const cookieStorage: SupportedStorage = {
    getItem: (key: string): string | null => {
      const requestValue = requestStorage.get(key);
      if (requestValue !== undefined) {
        return requestValue;
      }

      if (isPkceStorageKey(key) && req?.cookies?.[key]) {
        return req.cookies[key];
      }

      return null;
    },
    setItem: (key: string, value: string): void => {
      requestStorage.set(key, value);

      if (isPkceStorageKey(key) && res) {
        res.cookie(key, value, {
          httpOnly: true,
          secure: shouldUseSecureCookies(config.NODE_ENV),
          sameSite: 'lax',
          path: '/',
          maxAge: 10 * 60 * 1000, // 10 minutes for PKCE verifier / flow-index items
        });
      }
    },
    removeItem: (key: string): void => {
      requestStorage.delete(key);

      if (isPkceStorageKey(key) && res) {
        res.clearCookie(key, { path: '/' });
      }
    },
  };

  const url = config.SUPABASE_URL || 'https://example.supabase.co';
  const anonKey = config.SUPABASE_ANON_KEY || 'mock-anon-key';

  const token =
    accessToken ||
    req?.session?.access_token ||
    req?.cookies?.['sb-access-token'] ||
    (req?.headers?.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : undefined);

  const globalHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  return createClient(url, anonKey, {
    ...(globalHeaders && { global: { headers: globalHeaders } }),
    auth: {
      flowType: 'pkce',
      // true makes auth-js use the supplied storage adapter. The adapter above
      // keeps session state request-local and writes only PKCE keys to cookies.
      persistSession: true,
      autoRefreshToken: false,
      storage: cookieStorage,
      detectSessionInUrl: false,
    },
  });
}

let mockClient: SupabaseClient | null = null;

export function getSupabaseClient(
  req?: Request,
  res?: Response,
  accessToken?: string
): SupabaseClient {
  if (mockClient) {
    return mockClient;
  }
  return createExpressSupabaseClient(req, res, accessToken);
}

export function setSupabaseClient(client: SupabaseClient | null): void {
  mockClient = client;
}
