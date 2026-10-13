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
  const cookieStorage: SupportedStorage = {
    getItem: (key: string): string | null => {
      if (req && req.cookies && req.cookies[key]) {
        return req.cookies[key];
      }
      return null;
    },
    setItem: (key: string, value: string): void => {
      if (res) {
        res.cookie(key, value, {
          httpOnly: true,
          secure: shouldUseSecureCookies(config.NODE_ENV),
          sameSite: 'lax',
          maxAge: 10 * 60 * 1000, // 10 minutes for PKCE verifier / temp auth items
        });
      }
    },
    removeItem: (key: string): void => {
      if (res) {
        res.clearCookie(key);
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
      persistSession: false,
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
