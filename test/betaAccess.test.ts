import request from 'supertest';
import type { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { createApp } from '../src/app';
import * as authService from '../src/app/services/authService';
import { config } from '../src/config/env';
import {
  BETA_WELCOME_COOKIE,
  BETA_WELCOME_SEEN_COOKIE,
  INVITE_ONLY_ACCESS_DENIED_MESSAGE,
  isBetaAllowedEmail,
  setBetaWelcomeFlashCookie,
} from '../src/app/services/betaAccess';

const app = createApp();

describe('invite-only beta access and onboarding', () => {
  let originalEnabled: boolean;
  let originalAllowlist: string;

  beforeEach(() => {
    originalEnabled = config.BETA_INVITE_ONLY_ENABLED;
    originalAllowlist = config.BETA_ALLOWED_EMAILS;
    config.BETA_INVITE_ONLY_ENABLED = true;
    config.BETA_ALLOWED_EMAILS = 'approved@example.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    config.BETA_INVITE_ONLY_ENABLED = originalEnabled;
    config.BETA_ALLOWED_EMAILS = originalAllowlist;
  });

  it('normalizes email addresses and fails closed for missing or unlisted addresses', () => {
    expect(isBetaAllowedEmail(' Approved@Example.com ')).toBe(true);
    expect(isBetaAllowedEmail('not-approved@example.com')).toBe(false);
    expect(isBetaAllowedEmail(undefined)).toBe(false);
    expect(isBetaAllowedEmail('approved@example.com', {
      inviteOnlyEnabled: true,
      allowedEmails: '',
    })).toBe(false);
    expect(isBetaAllowedEmail('anyone@example.com', {
      inviteOnlyEnabled: false,
      allowedEmails: '',
    })).toBe(true);
  });

  it('shows the private-pilot explanation and rejects uninvited sign-up before calling Auth', async () => {
    const signUpSpy = jest.spyOn(authService, 'signUp');
    const response = await request(app)
      .post('/auth/signup')
      .set('Origin', 'http://localhost:3000')
      .set('Accept', 'text/html')
      .send({
        username: 'not_invited',
        displayName: 'Not Invited',
        email: 'not-invited@example.com',
        password: 'SafePassword123!',
      });

    expect(response.status).toBe(403);
    expect(response.text).toContain(INVITE_ONLY_ACCESS_DENIED_MESSAGE);
    expect(response.text).toContain('Private beta — invitation required');
    expect(signUpSpy).not.toHaveBeenCalled();
  });

  it('rejects uninvited password sign-in without calling the Auth provider', async () => {
    const loginSpy = jest.spyOn(authService, 'login');
    const response = await request(app)
      .post('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Accept', 'text/html')
      .send({ email: 'not-invited@example.com', password: 'test-password' });

    expect(response.status).toBe(403);
    expect(response.text).toContain(INVITE_ONLY_ACCESS_DENIED_MESSAGE);
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('does not keep an app session for an identity removed from the private allowlist', async () => {
    jest.spyOn(authService, 'getUserFromToken').mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'removed@example.com',
    } as unknown as User);

    const response = await request(app)
      .get('/profile')
      .set('Cookie', 'sb-access-token=synthetic-test-token')
      .set('Accept', 'text/html');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
    const setCookies = response.headers['set-cookie'];
    expect(Array.isArray(setCookies) ? setCookies.join(';') : setCookies || '').toContain('sb-access-token=;');
  });

  it('renders and expires the one-use welcome flash on the first HTML response', async () => {
    const first = await request(app)
      .get('/auth/login')
      .set('Cookie', `${BETA_WELCOME_COOKIE}=1`)
      .set('Accept', 'text/html');

    expect(first.status).toBe(200);
    expect(first.text).toContain('You’re in — welcome to The Vinyl Drop beta!');
    const welcomeCookies = first.headers['set-cookie'];
    expect(Array.isArray(welcomeCookies) ? welcomeCookies.join(';') : welcomeCookies || '').toContain(`${BETA_WELCOME_COOKIE}=;`);

    const second = await request(app)
      .get('/auth/login')
      .set('Accept', 'text/html');

    expect(second.status).toBe(200);
    expect(second.text).not.toContain('You’re in — welcome to The Vinyl Drop beta!');
  });

  it('sets a short-lived welcome flash and a 180-day browser marker', () => {
    const req = { cookies: {} } as Request;
    const res = { cookie: jest.fn() } as unknown as Response;

    setBetaWelcomeFlashCookie(req, res);

    expect(res.cookie).toHaveBeenNthCalledWith(
      1,
      BETA_WELCOME_SEEN_COOKIE,
      '1',
      expect.objectContaining({ httpOnly: true, maxAge: 180 * 24 * 60 * 60 * 1000, sameSite: 'lax', path: '/' })
    );
    expect(res.cookie).toHaveBeenNthCalledWith(
      2,
      BETA_WELCOME_COOKIE,
      '1',
      expect.objectContaining({ httpOnly: true, maxAge: 60 * 1000, sameSite: 'lax', path: '/' })
    );
  });

  it('does not show a new welcome when this browser already has the seen marker', () => {
    const req = { cookies: { [BETA_WELCOME_SEEN_COOKIE]: '1' } } as unknown as Request;
    const res = { cookie: jest.fn() } as unknown as Response;

    setBetaWelcomeFlashCookie(req, res);

    expect(res.cookie).not.toHaveBeenCalled();
  });
});
