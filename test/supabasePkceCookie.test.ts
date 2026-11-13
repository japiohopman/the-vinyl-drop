/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createExpressSupabaseClient } from '../src/lib/supabase';
import { config } from '../src/config/env';

describe('Express Supabase PKCE verifier cookie round-trip', () => {
  const originalNodeEnv = config.NODE_ENV;
  const originalSupabaseUrl = config.SUPABASE_URL;
  const originalAnonKey = config.SUPABASE_ANON_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    config.NODE_ENV = originalNodeEnv;
    config.SUPABASE_URL = originalSupabaseUrl;
    config.SUPABASE_ANON_KEY = originalAnonKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('persists the verifier on OAuth start and reads it on the callback request', async () => {
    config.NODE_ENV = 'test';
    config.SUPABASE_URL = 'https://pkce-roundtrip.supabase.co';
    config.SUPABASE_ANON_KEY = 'test-anon-key';

    let verifierFromCookie = '';
    let verifierFromExchange = '';
    let callbackReceivedVerifierCookie = false;

    const fetchMock = jest.fn(async (input: any, init: any) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      expect(requestUrl).toContain('/auth/v1/token?grant_type=pkce');

      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.auth_code).toBe('test-oauth-code');
      verifierFromExchange = body.code_verifier;

      const sessionPayload = {
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'pkce-test@example.test',
          app_metadata: { provider: 'google', providers: ['google'] },
          user_metadata: {},
          created_at: '2026-11-13T00:00:00.000Z',
        },
      };

      return {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
        json: async () => sessionPayload,
        text: async () => JSON.stringify(sessionPayload),
      } as any;
    });
    global.fetch = fetchMock as any;

    const app = express();
    app.use(cookieParser());

    app.get('/auth/google', async (req, res) => {
      try {
        const { data, error } = await createExpressSupabaseClient(req, res).auth.signInWithOAuth({
          provider: 'google',
          options: {
            skipBrowserRedirect: true,
            redirectTo: 'http://localhost/auth/callback',
          },
        });

        if (error || !data.url) {
          res.status(500).end();
          return;
        }

        res.redirect(data.url);
      } catch {
        res.status(500).end();
      }
    });

    app.get('/auth/callback', async (req, res) => {
      callbackReceivedVerifierCookie = Object.keys(req.cookies ?? {}).some((key) =>
        key.endsWith('-auth-token-code-verifier')
      );

      try {
        const { data, error } = await createExpressSupabaseClient(req, res).auth.exchangeCodeForSession(
          'test-oauth-code'
        );
        res.status(error || !data.session ? 400 : 200).json({ authenticated: Boolean(data.session) });
      } catch {
        res.status(500).end();
      }
    });

    // The agent acts as a browser cookie jar between the two HTTP requests.
    const browser = request.agent(app);
    const startResponse = await browser.get('/auth/google');

    expect(startResponse.status).toBe(302);
    const setCookieHeaders = (startResponse.headers['set-cookie'] || []) as string[];
    const verifierCookie = setCookieHeaders.find((header) =>
      header.includes('-auth-token-code-verifier=')
    );
    expect(verifierCookie).toBeDefined();

    const cookiePair = verifierCookie!.split(';', 1)[0];
    verifierFromCookie = decodeURIComponent(cookiePair.slice(cookiePair.indexOf('=') + 1));
    expect(verifierFromCookie.length).toBeGreaterThanOrEqual(43);

    const callbackResponse = await browser.get('/auth/callback');

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.body).toEqual({ authenticated: true });
    expect(callbackReceivedVerifierCookie).toBe(true);
    expect(verifierFromExchange).toBe(verifierFromCookie.split('/')[0]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
