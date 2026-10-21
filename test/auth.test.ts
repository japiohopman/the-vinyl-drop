/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { createApp } from '../src/app';
import { setSupabaseClient } from '../src/lib/supabase';
import { isAllowedRedirectUrl, sanitizeRedirectUrl } from '../src/validators/auth';
import * as profileRepository from '../src/app/repositories/profileRepository';
import { ensureProfileForUser, signUp } from '../src/app/services/authService';
import { Profile } from '../src/db/schema/profiles';
import crypto from 'crypto';
import { generateRecoveryToken } from '../src/app/middleware/auth';
import { config } from '../src/config/env';
import { isPasswordPwned } from '../src/app/services/pwnedPasswordService';
import { createPasswordCheckedSignupApproval } from '../src/app/repositories/signupApprovalRepository';
import { saveRegistrationConsent, hasRegistrationConsent } from '../src/app/repositories/registrationConsentRepository';

jest.mock('../src/app/services/pwnedPasswordService', () => ({
  isPasswordPwned: jest.fn(),
}));

jest.mock('../src/app/repositories/signupApprovalRepository', () => ({
  createPasswordCheckedSignupApproval: jest.fn(),
}));

jest.mock('../src/app/repositories/registrationConsentRepository', () => ({
  saveRegistrationConsent: jest.fn(),
  hasRegistrationConsent: jest.fn(),
}));

const mockIsPasswordPwned = isPasswordPwned as jest.MockedFunction<typeof isPasswordPwned>;
const mockCreatePasswordCheckedSignupApproval = createPasswordCheckedSignupApproval as jest.MockedFunction<
  typeof createPasswordCheckedSignupApproval
>;
const mockSaveRegistrationConsent = saveRegistrationConsent as jest.MockedFunction<typeof saveRegistrationConsent>;
const mockHasRegistrationConsent = hasRegistrationConsent as jest.MockedFunction<typeof hasRegistrationConsent>;

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
        websiteUrl: null,
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
      mockIsPasswordPwned.mockResolvedValue(false);
      mockCreatePasswordCheckedSignupApproval.mockResolvedValue(undefined);
      mockSaveRegistrationConsent.mockResolvedValue(undefined);
      mockHasRegistrationConsent.mockResolvedValue(false);

      mockSupabase = {
        auth: {
          signUp: jest.fn(),
          signInWithPassword: jest.fn(),
          signInWithOAuth: jest.fn(),
          exchangeCodeForSession: jest.fn(),
          verifyOtp: jest.fn(),
          resetPasswordForEmail: jest.fn(),
          updateUser: jest.fn(),
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
      expect(res.text).toContain('name="termsAccepted"');
      expect(res.text).toContain('name="ageConfirmed"');
      expect(res.text).toContain('href="/privacy"');
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
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'a', // too short
          email: 'invalid-email',
          password: '123', // too short,
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Username must be at least 3 characters long');
      expect(res.text).toContain('Please enter a valid email address');
      expect(res.text).toContain('Password must be at least 8 characters long');
    });

    it('POST /auth/signup rejects missing Terms and 18+ confirmation before calling Supabase', async () => {
      const app = createApp();
      const res = await request(app).post('/auth/signup').set('Origin', 'http://localhost:3000')
        .send({ username: 'adult_digger', email: 'adult@example.com', password: 'securepassword123' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('You must accept the Terms of Use to create an account.');
      expect(res.text).toContain('You must confirm that you are at least 18 years old.');
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
    });

    it('signup service fails closed when no server-validated consent record is supplied', async () => {
      const result = await signUp({
        username: 'service_guard',
        email: 'service-guard@example.com',
        password: 'securepassword123',
        termsAccepted: 'true',
        ageConfirmed: 'true',
      });
      expect(result.error).toContain('You must accept the Terms of Use');
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
      expect(mockIsPasswordPwned).not.toHaveBeenCalled();
    });

    it('POST /auth/signup should reject a breached password before calling Supabase Auth', async () => {
      const submittedPassword = 'known-breached-password-test-value';
      mockIsPasswordPwned.mockResolvedValue(true);
      const supabaseSignUpSpy = mockSupabase.auth.signUp;
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'breached_digger',
          email: 'breached@example.com',
          password: submittedPassword,
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('This password appears in known data breaches. Please choose a different password.');
      expect(res.text).not.toContain(submittedPassword);
      expect(supabaseSignUpSpy).not.toHaveBeenCalled();
      expect(mockCreatePasswordCheckedSignupApproval).not.toHaveBeenCalled();
    });

    it('POST /auth/signup should fail closed when checked-signup approval persistence is unavailable', async () => {
      mockCreatePasswordCheckedSignupApproval.mockRejectedValue(new Error('private database detail'));
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .set('Origin', 'http://localhost:3000')
        .send({ username: 'approval_digger', email: 'approval@example.com', password: 'securepassword123',
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Account creation is temporarily unavailable. Please try again in a moment.');
      expect(res.text).not.toContain('private database detail');
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
    });

    it('POST /auth/signup should fail closed when the password lookup is unavailable', async () => {
      const submittedPassword = 'temporary-strong-test-password';
      mockIsPasswordPwned.mockRejectedValue(new Error('private lookup detail'));
      const supabaseSignUpSpy = mockSupabase.auth.signUp;
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'retry_digger',
          email: 'retry@example.com',
          password: submittedPassword,
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Password security check is temporarily unavailable. Please try again in a moment.');
      expect(res.text).not.toContain(submittedPassword);
      expect(res.text).not.toContain('private lookup detail');
      expect(supabaseSignUpSpy).not.toHaveBeenCalled();
      expect(mockCreatePasswordCheckedSignupApproval).not.toHaveBeenCalled();
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
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'new_digger',
          email: 'newuser@example.com',
          password: 'securepassword123',
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(302);
      expect(mockIsPasswordPwned).toHaveBeenCalledWith('securepassword123');

      const signupOptions = mockSupabase.auth.signUp.mock.calls[0][0].options;
      const emailRedirectTo = new URL(signupOptions.emailRedirectTo);
      expect(emailRedirectTo.origin).toBe(new URL(config.APP_BASE_URL).origin);
      expect(emailRedirectTo.pathname).toBe('/auth/callback');
      expect(isAllowedRedirectUrl(emailRedirectTo.toString())).toBe(true);
      expect(emailRedirectTo.searchParams.get('next')).toBe('/profile');
      expect(signupOptions.data).toEqual({
        username: 'new_digger',
        display_name: 'new_digger',
        signup_approval_id: expect.any(String),
      });
      expect(signupOptions.data.signup_approval_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(mockCreatePasswordCheckedSignupApproval).toHaveBeenCalledWith(
        signupOptions.data.signup_approval_id,
        'newuser@example.com',
        undefined
      );
      expect(mockCreatePasswordCheckedSignupApproval.mock.invocationCallOrder[0]).toBeLessThan(
        mockSupabase.auth.signUp.mock.invocationCallOrder[0]
      );
      expect(mockSaveRegistrationConsent).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          termsVersion: 'beta-terms-2026-10-19-v2',
          termsAcceptedAt: expect.any(String),
          ageAttestedAt: expect.any(String),
        }),
        undefined
      );
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
        identities: [{ id: 'id-1', user_id: '55555555-5555-5555-5555-555555555555' }],
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
        .post('/auth/signup?next=%2Fbrowse%3Fgenre%3Djazz')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'unconfirmed_digger',
          email: 'unconfirmed@example.com',
          password: 'securepassword123',
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('Please check your email to confirm your account');

      const signupOptions = mockSupabase.auth.signUp.mock.calls[0][0].options;
      const emailRedirectTo = new URL(signupOptions.emailRedirectTo);
      expect(emailRedirectTo.origin).toBe(new URL(config.APP_BASE_URL).origin);
      expect(emailRedirectTo.pathname).toBe('/auth/callback');
      expect(isAllowedRedirectUrl(emailRedirectTo.toString())).toBe(true);
      expect(emailRedirectTo.searchParams.get('next')).toBe('/browse?genre=jazz');
      expect(signupOptions.data).toEqual({
        username: 'unconfirmed_digger',
        display_name: 'unconfirmed_digger',
        signup_approval_id: expect.any(String),
      });
      expect(createProfileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUser.id,
          username: 'unconfirmed_digger',
        }),
        undefined
      );
    });

    it('POST /auth/signup should handle obfuscated duplicate-signup response (empty identities) without creating a profile or exposing account existence', async () => {
      // Supabase obfuscated duplicate-signup result: user object returned, but identities array is []
      const obfuscatedUser = {
        id: 'obfuscated-uuid-12345',
        email: 'existing_account@example.com',
        identities: [],
      };

      mockSupabase.auth.signUp.mockResolvedValue({
        data: {
          user: obfuscatedUser,
          session: null,
        },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);
      const createProfileSpy = jest.spyOn(profileRepository, 'createProfile');

      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'jaapJeKentHem',
          email: 'existing_account@example.com',
          password: 'securepassword123',
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('Please check your email to confirm your account');
      expect(res.text).not.toContain('already exists');
      expect(createProfileSpy).not.toHaveBeenCalled();
    });

    it('POST /auth/signup should reject duplicate username across case variants', async () => {
      const existingProfile: Profile = {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'jaapJeKentHem',
        displayName: 'Jaap',
        avatarUrl: null,
        websiteUrl: null,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock repository returning existing profile for case variant
      jest.spyOn(profileRepository, 'findProfileByUsername').mockImplementation(async (username: string) => {
        if (username.toLowerCase() === 'jaapjekenthem') {
          return existingProfile;
        }
        return null;
      });

      const app = createApp();
      const res = await request(app)
        .post('/auth/signup')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'JaapJeKentHem', // Case variant of jaapJeKentHem
          email: 'newuser@example.com',
          password: 'securepassword123',
          termsAccepted: 'true',
          ageConfirmed: 'true',
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Username is already taken');
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
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
        websiteUrl: null,
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
        websiteUrl: null,
        bio: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = createApp();
      const res = await request(app)
        .post('/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(302);
      expect(mockIsPasswordPwned).not.toHaveBeenCalled();
      expect(res.header.location).toBe('/profile');
      const cookieHeader = res.header['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
      expect(cookies).toContain('sb-access-token=valid-token');
    });

    it('POST /auth/login should reject state-changing requests missing both Origin and Referer headers (CSRF Fail-Closed)', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'CSRF Forbidden: Missing Origin and Referer headers' });
    });

    it('POST /auth/login should reject cross-origin CSRF attempts', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/auth/login')
        .set('Origin', 'https://evil.com')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(403);
      expect(res.text).toContain('CSRF');
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

    it('POST /auth/google/start carries signed registration consent through the OAuth callback', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test' }, error: null });
      const app = createApp();
      const startResponse = await request(app).post('/auth/google/start').set('Origin', 'http://localhost:3000')
        .send({ termsAccepted: 'true', ageConfirmed: 'true', next: '/profile' });
      expect(startResponse.status).toBe(302);
      expect(startResponse.header.location).toContain('accounts.google.com');
      const redirectTo = new URL(mockSupabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo);
      expect(redirectTo.pathname).toBe('/auth/callback');
      expect(redirectTo.searchParams.get('flow')).toBe('signup');
      expect(redirectTo.searchParams.get('next')).toBe('/profile');
      const setCookies = startResponse.headers['set-cookie'];
      const cookiePairs = (Array.isArray(setCookies) ? setCookies : [setCookies]).filter(Boolean).map((value: string) => value.split(';')[0]);
      expect(cookiePairs.some((value: string) => value.startsWith('tvd-registration-consent='))).toBe(true);
      const mockUser = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', email: 'googleuser@gmail.com', user_metadata: { full_name: 'New OAuth Tester' } };
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({ data: { user: mockUser, session: { access_token: 'oauth-consent-token', refresh_token: 'oauth-consent-refresh', expires_in: 3600 } }, error: null });
      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);
      jest.spyOn(profileRepository, 'createProfile').mockImplementation(async (data: any) => ({ ...data, bio: null, location: null, createdAt: new Date(), updatedAt: new Date() }));
      const callback = await request(app).get('/auth/callback?code=synthetic-oauth-code&flow=signup&next=%2Fprofile').set('Cookie', cookiePairs.join('; '));
      expect(callback.status).toBe(302);
      expect(callback.header.location).toBe('/profile');
      expect(mockSaveRegistrationConsent).toHaveBeenCalledWith(mockUser.id, expect.objectContaining({ termsVersion: 'beta-terms-2026-10-19-v2' }), undefined);
    });

    it('GET /auth/callback rejects first-time Google accounts without registration consent', async () => {
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

      const createProfileSpy = jest.spyOn(profileRepository, 'createProfile');
      const app = createApp();
      const res = await request(app).get('/auth/callback?code=mock-pkce-code-123&next=/profile');
      expect(res.status).toBe(400);
      expect(res.text).toContain('complete registration');
      expect(createProfileSpy).not.toHaveBeenCalled();
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

    it('GET /auth/logout should return 404 Not Found (logout is strictly POST-only)', async () => {
      const app = createApp();
      const res = await request(app).get('/auth/logout');

      expect(res.status).toBe(404);
    });

    it('POST /auth/logout should clear cookies and redirect', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/auth/logout')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/');
      const cookieHeader = res.header['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
      expect(cookies).toContain('sb-access-token=;');
    });

    describe('Password Recovery & Reset Flow (Issue #79)', () => {
      it('GET /auth/forgot-password should render forgot password page', async () => {
        const app = createApp();
        const res = await request(app).get('/auth/forgot-password');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Reset Password');
        expect(res.text).toContain('name="email"');
      });

      it('POST /auth/forgot-password should reject invalid email with Zod error', async () => {
        const app = createApp();
        const res = await request(app)
          .post('/auth/forgot-password')
          .set('Origin', 'http://localhost:3000')
          .send({ email: 'invalid-email' });

        expect(res.status).toBe(400);
        expect(res.text).toContain('Please enter a valid email address');
      });

      it('POST /auth/forgot-password should send reset email and always return neutral response without exposing account existence', async () => {
        mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
          data: {},
          error: null,
        });

        const app = createApp();
        const res = await request(app)
          .post('/auth/forgot-password')
          .set('Origin', 'http://localhost:3000')
          .send({ email: 'registered@example.com' });

        expect(res.status).toBe(200);
        expect(res.text).toContain('If an account with that email exists, we have sent instructions');
        expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'registered@example.com',
          expect.objectContaining({
            redirectTo: expect.stringContaining('/auth/callback?next=/auth/reset-password'),
          })
        );
      });

      it('POST /auth/forgot-password should return neutral response even when provider reports user not found error', async () => {
        mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
          data: null,
          error: { message: 'User not found' },
        });

        const app = createApp();
        const res = await request(app)
          .post('/auth/forgot-password')
          .set('Origin', 'http://localhost:3000')
          .send({ email: 'nonexistent@example.com' });

        expect(res.status).toBe(200);
        expect(res.text).toContain('If an account with that email exists, we have sent instructions');
        expect(res.text).not.toContain('User not found');
      });

      it('POST /auth/forgot-password should enforce same-origin CSRF protection', async () => {
        const app = createApp();
        const res = await request(app)
          .post('/auth/forgot-password')
          .set('Origin', 'https://attacker.org')
          .send({ email: 'victim@example.com' });

        expect(res.status).toBe(403);
        expect(res.text).toContain('CSRF');
      });

      it('GET /auth/callback with token_hash & type=recovery should verify OTP and set recovery session cookies', async () => {
        const mockUser = {
          id: '77777777-7777-7777-7777-777777777777',
          email: 'recovering@example.com',
        };

        mockSupabase.auth.verifyOtp.mockResolvedValue({
          data: {
            user: mockUser,
            session: {
              access_token: 'recovery-access-token',
              refresh_token: 'recovery-refresh-token',
              expires_in: 3600,
            },
          },
          error: null,
        });

        jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue({
          id: mockUser.id,
          username: 'recovering_user',
          displayName: 'Recovering User',
          avatarUrl: null,
          websiteUrl: null,
          bio: null,
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const app = createApp();
        const res = await request(app).get(
          '/auth/callback?token_hash=mock_token_hash&type=recovery&next=%2Fauth%2Freset-password'
        );

        expect(res.status).toBe(302);
        expect(res.header.location).toBe('/auth/reset-password');
        const cookieHeader = res.header['set-cookie'];
        const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
        expect(cookies).toContain('sb-access-token=recovery-access-token');
        expect(cookies).toContain('sb-recovery-mode=77777777-7777-7777-7777-777777777777.');
      });

      it('GET /auth/callback with PKCE code and forged type=recovery plus next=/auth/reset-password should NOT set recovery cookie', async () => {
        const mockUser = {
          id: '99999999-9999-9999-9999-999999999999',
          email: 'oauth_user@example.com',
        };

        mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
          data: {
            user: mockUser,
            session: {
              access_token: 'oauth-access-token',
              refresh_token: 'oauth-refresh-token',
              expires_in: 3600,
            },
          },
          error: null,
        });

        jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue({
          id: mockUser.id,
          username: 'oauth_user',
          displayName: 'OAuth User',
          avatarUrl: null,
          websiteUrl: null,
          bio: null,
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const app = createApp();
        const res = await request(app).get('/auth/callback?code=mock_code&type=recovery&next=%2Fauth%2Freset-password');

        expect(res.status).toBe(302);
        const cookieHeader = res.header['set-cookie'];
        const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
        expect(cookies).toContain('sb-access-token=oauth-access-token');
        expect(cookies).not.toContain('sb-recovery-mode=');
      });

      it('GET /auth/callback when verifyOtp fails (invalid/expired recovery token) should NOT set recovery cookie', async () => {
        mockSupabase.auth.verifyOtp.mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Token has expired or is invalid' },
        });

        const app = createApp();
        const res = await request(app).get(
          '/auth/callback?token_hash=expired_token_hash&type=recovery&next=%2Fauth%2Freset-password'
        );

        expect(res.status).toBe(400);
        expect(res.text).toContain('Token has expired or is invalid');
        const cookieHeader = res.header['set-cookie'];
        const cookies = cookieHeader ? (Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader)) : '';
        expect(cookies).not.toContain('sb-recovery-mode=');
      });

      it('GET /auth/callback with type=signup or magiclink should NOT set recovery cookie', async () => {
        const mockUser = {
          id: '77777777-7777-7777-7777-777777777777',
          email: 'signup@example.com',
        };

        mockSupabase.auth.verifyOtp.mockResolvedValue({
          data: {
            user: mockUser,
            session: {
              access_token: 'signup-access-token',
              refresh_token: 'signup-refresh-token',
              expires_in: 3600,
            },
          },
          error: null,
        });

        jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue({
          id: mockUser.id,
          username: 'signup_user',
          displayName: 'Signup User',
          avatarUrl: null,
          websiteUrl: null,
          bio: null,
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const app = createApp();
        const res = await request(app).get('/auth/callback?token_hash=mock_token_hash&type=signup');

        expect(res.status).toBe(302);
        const cookieHeader = res.header['set-cookie'];
        const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
        expect(cookies).toContain('sb-access-token=signup-access-token');
        expect(cookies).not.toContain('sb-recovery-mode=true');
      });

      it('GET /auth/reset-password should reject ordinary login sessions lacking recovery marker', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'user@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        const app = createApp();
        const res = await request(app)
          .get('/auth/reset-password')
          .set('Cookie', ['sb-access-token=ordinary-user-token']); // No sb-recovery-mode cookie!

        expect(res.status).toBe(400);
        expect(res.text).toContain('Password reset link is invalid or has expired');
      });

      it('POST /auth/reset-password should reject ordinary login sessions with a forged plain or invalid marker cookie and NEVER call updateUser', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'user@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        const updateUserSpy = mockSupabase.auth.updateUser;
        const app = createApp();

        // Attempt with forged plain boolean marker
        const resPlain = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', ['sb-access-token=ordinary-user-token', 'sb-recovery-mode=true'])
          .send({
            password: 'brandnewpassword123',
            confirmPassword: 'brandnewpassword123',
          });

        expect(resPlain.status).toBe(400);
        expect(resPlain.text).toContain('Password reset link is invalid or has expired');
        expect(updateUserSpy).not.toHaveBeenCalled();

        // Attempt with forged fake signature marker
        const resForged = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', ['sb-access-token=ordinary-user-token', 'sb-recovery-mode=88888888-8888-8888-8888-888888888888.9999999999.fake_signature'])
          .send({
            password: 'brandnewpassword123',
            confirmPassword: 'brandnewpassword123',
          });

        expect(resForged.status).toBe(400);
        expect(resForged.text).toContain('Password reset link is invalid or has expired');
        expect(updateUserSpy).not.toHaveBeenCalled();
      });

      it('GET and POST /auth/reset-password should reject an expired signed recovery token and NEVER call updateUser', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'user@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        // Construct a token signed with the actual secret, but with an expired timestamp in the past
        const expiredTimestamp = Date.now() - 60000; // 1 minute in the past
        const payload = `${mockUser.id}:${expiredTimestamp}`;
        const RECOVERY_SECRET = config.RECOVERY_SIGNING_SECRET;
        const signature = crypto.createHmac('sha256', RECOVERY_SECRET).update(payload).digest('hex');
        const expiredToken = `${mockUser.id}.${expiredTimestamp}.${signature}`;

        const updateUserSpy = mockSupabase.auth.updateUser;
        const app = createApp();

        // GET with expired token
        const resGet = await request(app)
          .get('/auth/reset-password')
          .set('Cookie', ['sb-access-token=valid-user-token', `sb-recovery-mode=${expiredToken}`]);

        expect(resGet.status).toBe(400);
        expect(resGet.text).toContain('Password reset link is invalid or has expired');

        // POST with expired token
        const resPost = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', ['sb-access-token=valid-user-token', `sb-recovery-mode=${expiredToken}`])
          .send({
            password: 'brandnewpassword123',
            confirmPassword: 'brandnewpassword123',
          });

        expect(resPost.status).toBe(400);
        expect(resPost.text).toContain('Password reset link is invalid or has expired');
        expect(updateUserSpy).not.toHaveBeenCalled();
      });

      it('GET /auth/reset-password should render new password form when authenticated with verified recovery session', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'reset@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        const validRecoveryToken = generateRecoveryToken(mockUser.id);
        const app = createApp();
        const res = await request(app)
          .get('/auth/reset-password')
          .set('Cookie', ['sb-access-token=valid-recovery-token', `sb-recovery-mode=${validRecoveryToken}`]);

        expect(res.status).toBe(200);
        expect(res.text).toContain('Choose New Password');
        expect(res.text).toContain('name="password"');
        expect(res.text).toContain('name="confirmPassword"');
      });

      it('POST /auth/reset-password should reject omitted, empty, or mismatched confirmation password', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'reset@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        const validRecoveryToken = generateRecoveryToken(mockUser.id);
        const app = createApp();

        // Omitted confirmation
        const resOmitted = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', ['sb-access-token=valid-recovery-token', `sb-recovery-mode=${validRecoveryToken}`])
          .send({
            password: 'securepassword123',
          });

        expect(resOmitted.status).toBe(400);
        expect(resOmitted.text).toContain('Please confirm your new password');

        // Mismatched confirmation
        const resMismatched = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', ['sb-access-token=valid-recovery-token', `sb-recovery-mode=${validRecoveryToken}`])
          .send({
            password: 'securepassword123',
            confirmPassword: 'differentpassword123',
          });

        expect(resMismatched.status).toBe(400);
        expect(resMismatched.text).toContain('Passwords do not match');
      });

      it('POST /auth/reset-password should reject breached new passwords before calling Supabase Auth', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'reset@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        mockSupabase.auth.setSession = jest.fn().mockResolvedValue({
          data: { user: mockUser, session: { access_token: 'valid-recovery-token', refresh_token: 'valid-refresh-token' } },
          error: null,
        });

        mockIsPasswordPwned.mockResolvedValue(true);
        const updateUserSpy = mockSupabase.auth.updateUser;

        const validRecoveryToken = generateRecoveryToken(mockUser.id);
        const app = createApp();
        const res = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', [
            'sb-access-token=valid-recovery-token',
            'sb-refresh-token=valid-refresh-token',
            `sb-recovery-mode=${validRecoveryToken}`,
          ])
          .send({
            password: 'breachedpassword123',
            confirmPassword: 'breachedpassword123',
          });

        expect(res.status).toBe(400);
        expect(res.text).toContain('This password appears in known data breaches. Please choose a different password.');
        expect(res.text).not.toContain('breachedpassword123');
        expect(updateUserSpy).not.toHaveBeenCalled();
      });

      it('POST /auth/reset-password should fail closed when HIBP lookup fails', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'reset@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        mockSupabase.auth.setSession = jest.fn().mockResolvedValue({
          data: { user: mockUser, session: { access_token: 'valid-recovery-token', refresh_token: 'valid-refresh-token' } },
          error: null,
        });

        mockIsPasswordPwned.mockRejectedValue(new Error('Network error'));
        const updateUserSpy = mockSupabase.auth.updateUser;

        const validRecoveryToken = generateRecoveryToken(mockUser.id);
        const app = createApp();
        const res = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', [
            'sb-access-token=valid-recovery-token',
            'sb-refresh-token=valid-refresh-token',
            `sb-recovery-mode=${validRecoveryToken}`,
          ])
          .send({
            password: 'validstrongpassword123',
            confirmPassword: 'validstrongpassword123',
          });

        expect(res.status).toBe(400);
        expect(res.text).toContain('Password security check is temporarily unavailable. Please try again in a moment.');
        expect(updateUserSpy).not.toHaveBeenCalled();
      });

      it('POST /auth/reset-password should restore session via setSession prior to calling updateUser', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'reset@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        mockSupabase.auth.setSession = jest.fn().mockResolvedValue({
          data: { user: mockUser, session: { access_token: 'valid-recovery-token', refresh_token: 'valid-refresh-token' } },
          error: null,
        });

        mockSupabase.auth.updateUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        const validRecoveryToken = generateRecoveryToken(mockUser.id);
        const app = createApp();
        const res = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', [
            'sb-access-token=valid-recovery-token',
            'sb-refresh-token=valid-refresh-token',
            `sb-recovery-mode=${validRecoveryToken}`,
          ])
          .send({
            password: 'brandnewstrongpassword123',
            confirmPassword: 'brandnewstrongpassword123',
          });

        expect(res.status).toBe(200);
        expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
          access_token: 'valid-recovery-token',
          refresh_token: 'valid-refresh-token',
        });
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'brandnewstrongpassword123' });
      });

      it('POST /auth/reset-password should fail safely and NEVER call updateUser when setSession fails or session is missing', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'reset@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        mockSupabase.auth.setSession = jest.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Auth session missing!' },
        });

        const updateUserSpy = mockSupabase.auth.updateUser;
        const validRecoveryToken = generateRecoveryToken(mockUser.id);
        const app = createApp();
        const res = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', [
            'sb-access-token=valid-recovery-token',
            'sb-refresh-token=valid-refresh-token',
            `sb-recovery-mode=${validRecoveryToken}`,
          ])
          .send({
            password: 'brandnewstrongpassword123',
            confirmPassword: 'brandnewstrongpassword123',
          });

        expect(res.status).toBe(400);
        expect(res.text).toContain('Auth session missing!');
        expect(updateUserSpy).not.toHaveBeenCalled();
      });

      it('POST /auth/reset-password should update password, clear recovery session cookies, and require re-login upon success', async () => {
        const mockUser = { id: '88888888-8888-8888-8888-888888888888', email: 'reset@example.com' };
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        mockSupabase.auth.setSession = jest.fn().mockResolvedValue({
          data: { user: mockUser, session: { access_token: 'valid-recovery-token', refresh_token: 'valid-refresh-token' } },
          error: null,
        });

        mockSupabase.auth.updateUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });

        const validRecoveryToken = generateRecoveryToken(mockUser.id);
        const app = createApp();
        const res = await request(app)
          .post('/auth/reset-password')
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', [
            'sb-access-token=valid-recovery-token',
            'sb-refresh-token=valid-refresh-token',
            `sb-recovery-mode=${validRecoveryToken}`,
          ])
          .send({
            password: 'brandnewstrongpassword123',
            confirmPassword: 'brandnewstrongpassword123',
          });

        expect(res.status).toBe(200);
        expect(mockIsPasswordPwned).toHaveBeenCalledWith('brandnewstrongpassword123');
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'brandnewstrongpassword123' });
        expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(mockSupabase.auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
          mockSupabase.auth.signOut.mock.invocationCallOrder[0]
        );
        expect(res.text).toContain('Your password has been successfully updated. Please sign in with your new password.');
        const cookieHeader = res.header['set-cookie'];
        const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader);
        expect(cookies).toContain('sb-access-token=;');
      });

      it('POST /auth/reset-password should enforce same-origin CSRF protection', async () => {
        const app = createApp();
        const res = await request(app)
          .post('/auth/reset-password')
          .send({
            password: 'brandnewstrongpassword123',
            confirmPassword: 'brandnewstrongpassword123',
          });

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'CSRF Forbidden: Missing Origin and Referer headers' });
      });
    });
  });
});
