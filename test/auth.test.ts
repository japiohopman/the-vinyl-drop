/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { createApp } from '../src/app';
import { setSupabaseClient } from '../src/lib/supabase';
import { isAllowedRedirectUrl, sanitizeRedirectUrl } from '../src/validators/auth';
import * as profileRepository from '../src/app/repositories/profileRepository';
import { ensureProfileForUser } from '../src/app/services/authService';
import { Profile } from '../src/db/schema/profiles';

describe('Authentication & Session Handling', () => {
  describe('Redirect URL Allow-List Validation', () => {
    it('should allow valid relative paths', () => {
      expect(isAllowedRedirectUrl('/profile')).toBe(true);
      expect(isAllowedRedirectUrl('/browse?genre=jazz')).toBe(true);
    });

    it('should reject scheme-relative malicious URLs', () => {
      expect(isAllowedRedirectUrl('//evil.com')).toBe(false);
      expect(isAllowedRedirectUrl('//evil.com/login')).toBe(false);
    });

    it('should reject backslash and normalization open redirect bypass attempts', () => {
      expect(isAllowedRedirectUrl('/\\evil.com')).toBe(false);
      expect(isAllowedRedirectUrl('/\\\\evil.com')).toBe(false);
      expect(isAllowedRedirectUrl('/\\evil.com/login')).toBe(false);
    });

    it('should allow trusted origins matching APP_BASE_URL', () => {
      expect(isAllowedRedirectUrl('http://localhost:3000/profile')).toBe(true);
    });

    it('should reject unapproved external origins', () => {
      expect(isAllowedRedirectUrl('https://evil.com/phishing')).toBe(false);
      expect(isAllowedRedirectUrl('http://attacker.org')).toBe(false);
    });

    it('should fallback safely when sanitizeRedirectUrl receives invalid inputs', () => {
      expect(sanitizeRedirectUrl('https://evil.com', '/fallback')).toBe('/fallback');
      expect(sanitizeRedirectUrl('//evil.com', '/profile')).toBe('/profile');
      expect(sanitizeRedirectUrl('/\\evil.com', '/profile')).toBe('/profile');
      expect(sanitizeRedirectUrl('/valid-path', '/fallback')).toBe('/valid-path');
    });
  });

  describe('First-time Profile Bootstrap & Duplicate Prevention', () => {
    it('should bootstrap profile for a first-time authenticated user', async () => {
      const mockUser: any = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'digger@example.com',
        user_metadata: {
          username: 'digger_99',
          display_name: 'Record Digger',
        },
      };

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);
      const createSpy = jest.spyOn(profileRepository, 'createProfile').mockImplementation(async (data: any) => ({
        ...data,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const profile = await ensureProfileForUser(mockUser);

      expect(profile.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(profile.username).toBe('digger_99');
      expect(profile.displayName).toBe('Record Digger');
      expect(createSpy).toHaveBeenCalled();
    });

    it('should NOT create duplicate application profile for existing authenticated user ID', async () => {
      const existingProfile: Profile = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'existing_user',
        displayName: 'Existing User',
        avatarUrl: null,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUser: any = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'digger@example.com',
      };

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(existingProfile);
      const createSpy = jest.spyOn(profileRepository, 'createProfile');

      const profile = await ensureProfileForUser(mockUser);

      expect(profile).toEqual(existingProfile);
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('HTTP Auth Endpoints & Session Refresh with Mocked Supabase Auth Client', () => {
    let mockSupabase: any;

    beforeEach(() => {
      jest.clearAllMocks();

      mockSupabase = {
        auth: {
          signUp: jest.fn(),
          signInWithPassword: jest.fn(),
          signInWithOAuth: jest.fn(),
          exchangeCodeForSession: jest.fn(),
          getUser: jest.fn(),
          refreshSession: jest.fn(),
          signOut: jest.fn().mockResolvedValue({ error: null }),
        },
      };

      setSupabaseClient(mockSupabase);
    });

    it('GET /auth/signup should render signup form page', async () => {
      const app = createApp();
      const res = await request(app).get('/auth/signup');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Join The Vinyl Drop');
      expect(res.text).toContain('name="username"');
      expect(res.text).toContain('name="email"');
    });

    it('GET /auth/signup?next=%2Fprofile should render signup form page with next parameter', async () => {
      const app = createApp();
      const res = await request(app).get('/auth/signup?next=%2Fprofile');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Join The Vinyl Drop');
      expect(res.text).toContain('value="/profile"');
    });

    it('POST /auth/signup should reject invalid inputs with Zod form errors', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .send({
          username: 'a', // too short
          email: 'invalid-email',
          password: '123', // too short
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Username must be at least 3 characters long');
      expect(res.text).toContain('Please enter a valid email address');
      expect(res.text).toContain('Password must be at least 8 characters long');
    });

    it('POST /auth/signup should create user and set session cookies on immediate session', async () => {
      const mockUser = {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'newuser@example.com',
      };

      mockSupabase.auth.signUp.mockResolvedValue({
        data: {
          user: mockUser,
          session: {
            access_token: 'mock-access-token-123',
            refresh_token: 'mock-refresh-token-456',
            expires_in: 3600,
          },
        },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'createProfile').mockImplementation(async (data: any) => ({
        ...data,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .send({
          username: 'new_digger',
          email: 'newuser@example.com',
          password: 'securepassword123',
        });

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/profile');
      expect(res.header['set-cookie']).toBeDefined();
      const cookieHeader = res.header['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
      expect(cookies).toContain('sb-access-token=mock-access-token-123');
      expect(cookies).toContain('sb-refresh-token=mock-refresh-token-456');
    });

    it('POST /auth/signup should handle user creation with null session (email confirmation required) cleanly', async () => {
      const mockUser = {
        id: '55555555-5555-5555-5555-555555555555',
        email: 'unconfirmed@example.com',
      };

      mockSupabase.auth.signUp.mockResolvedValue({
        data: {
          user: mockUser,
          session: null, // Email confirmation required by Supabase
        },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(null);
      const createProfileSpy = jest.spyOn(profileRepository, 'createProfile').mockImplementation(async (data: any) => ({
        ...data,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .send({
          username: 'unconfirmed_digger',
          email: 'unconfirmed@example.com',
          password: 'securepassword123',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('Please check your email to confirm your account');
      expect(createProfileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUser.id,
          username: 'unconfirmed_digger',
        }),
        undefined
      );
    });

    it('sessionMiddleware should refresh session using refresh_token when access_token is expired or missing', async () => {
      const mockUser = {
        id: '66666666-6666-6666-6666-666666666666',
        email: 'refreshed@example.com',
      };

      const mockProfile: Profile = {
        id: mockUser.id,
        username: 'refreshed_user',
        displayName: 'Refreshed User',
        avatarUrl: null,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Access token fails or is missing
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      });

      // Refresh token succeeds
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {
          user: mockUser,
          session: {
            access_token: 'new-rotated-access-token',
            refresh_token: 'new-rotated-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(mockProfile);

      const app = createApp();
      const res = await request(app)
        .get('/profile')
        .set('Cookie', ['sb-refresh-token=valid-refresh-token']);

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/profiles/refreshed_user');
      const cookieHeader = res.header['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
      expect(cookies).toContain('sb-access-token=new-rotated-access-token');
      expect(cookies).toContain('sb-refresh-token=new-rotated-refresh-token');
    });

    it('GET /auth/login should render login page', async () => {
      const app = createApp();
      const res = await request(app).get('/auth/login');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Welcome Back');
      expect(res.text).toContain('Sign in with Google');
    });

    it('POST /auth/login should set cookies and redirect on valid credentials', async () => {
      const mockUser = {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'user@example.com',
      };

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: mockUser,
          session: {
            access_token: 'valid-token',
            refresh_token: 'valid-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue({
        id: mockUser.id,
        username: 'existing_digger',
        displayName: 'Existing Digger',
        avatarUrl: null,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = createApp();
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/profile');
      const cookieHeader = res.header['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
      expect(cookies).toContain('sb-access-token=valid-token');
    });

    it('GET /auth/google should redirect to provider OAuth URL', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: {
          url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        },
        error: null,
      });

      const app = createApp();
      const res = await request(app).get('/auth/google');

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('accounts.google.com');
    });

    it('GET /auth/callback should exchange PKCE code for session and bootstrap profile', async () => {
      const mockUser = {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'googleuser@gmail.com',
        user_metadata: {
          full_name: 'Google Vinyl Fan',
          avatar_url: 'https://example.com/avatar.jpg',
        },
      };

      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: {
          user: mockUser,
          session: {
            access_token: 'oauth-token-abc',
            refresh_token: 'oauth-refresh-xyz',
            expires_in: 3600,
          },
        },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'createProfile').mockImplementation(async (data: any) => ({
        ...data,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const app = createApp();
      const res = await request(app).get('/auth/callback?code=mock-pkce-code-123&next=/profile');

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/profile');
      const cookieHeader = res.header['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
      expect(cookies).toContain('sb-access-token=oauth-token-abc');
    });

    it('GET /auth/callback should handle PKCE exchange failure safely', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid PKCE authorization code' },
      });

      const app = createApp();
      const res = await request(app).get('/auth/callback?code=invalid-code');

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid PKCE authorization code');
    });

    it('POST /auth/logout should clear cookies and redirect', async () => {
      const app = createApp();
      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/');
      const cookieHeader = res.header['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
      expect(cookies).toContain('sb-access-token=;');
    });
  });
});
