import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { Request, Response } from 'express';
import { config } from '../config/env';

// Polyfill global WebSocket if missing in Node < 22 runtime environments
if (typeof globalThis.WebSocket === 'undefined') {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (globalThis as any).WebSocket = WebSocket;
}

export function createExpressSupabaseClient(req?: Request, res?: Response): SupabaseClient {
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
          secure: config.NODE_ENV === 'production',
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

  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
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

export function getSupabaseClient(req?: Request, res?: Response): SupabaseClient {
  if (mockClient) {
    return mockClient;
  }
  return createExpressSupabaseClient(req, res);
}

export function setSupabaseClient(client: SupabaseClient | null): void {
  mockClient = client;
}
