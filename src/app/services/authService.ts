import { User, Session, SupabaseClient, EmailOtpType } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { getSupabaseClient } from '../../lib/supabase';
import { findProfileById, findProfileByUsername, createProfile } from '../repositories/profileRepository';
import { Profile } from '../../db/schema/profiles';
import { SignUpInput, LoginInput, sanitizeRedirectUrl } from '../../validators/auth';
import { config } from '../../config/env';
import { getDb } from '../../db';
import { isPasswordPwned } from './pwnedPasswordService';
import { createPasswordCheckedSignupApproval } from '../repositories/signupApprovalRepository';

type DbInstance = ReturnType<typeof getDb>;

export interface AuthResult {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  error?: string;
  requiresEmailConfirmation?: boolean;
  isRecoverySession?: boolean;
}

export interface AuthOptions {
  req?: Request;
  res?: Response;
  supabase?: SupabaseClient;
  dbOverride?: DbInstance;
  /** Safe in-app destination after email confirmation; defaults to /profile. */
  signupNextUrl?: string;
}

/**
 * Ensures an application profile exists for the given Supabase user.
 * Guarantees that supported identities matching the same Supabase Auth user ID
 * do not create duplicate application profiles.
 */
export async function ensureProfileForUser(
  user: User,
  preferredUsername?: string,
  dbOverride?: DbInstance
): Promise<Profile> {
  const existingProfile = await findProfileById(user.id, dbOverride);
  if (existingProfile) {
    return existingProfile;
  }

  // Derive candidate username
  let baseUsername =
    preferredUsername ||
    (user.user_metadata?.username as string) ||
    (user.email ? user.email.split('@')[0] : '') ||
    `user_${user.id.substring(0, 8)}`;

  // Sanitize username to alphanumeric, underscore, hyphen
  baseUsername = baseUsername.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (baseUsername.length < 3) {
    baseUsername = `user_${baseUsername.padEnd(3, '0')}`;
  }
  if (baseUsername.length > 25) {
    baseUsername = baseUsername.substring(0, 25);
  }

  let finalUsername = baseUsername;
  let attempt = 0;
  while (await findProfileByUsername(finalUsername, dbOverride)) {
    attempt++;
    finalUsername = `${baseUsername}_${attempt}`;
  }

  const displayName =
    (user.user_metadata?.display_name as string) ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    finalUsername;

  const avatarUrl =
    (user.user_metadata?.avatar_url as string) ||
    (user.user_metadata?.picture as string) ||
    null;

  const newProfile = await createProfile(
    {
      id: user.id,
      username: finalUsername,
      displayName,
      avatarUrl,
    },
    dbOverride
  );

  return newProfile;
}

export async function signUp(input: SignUpInput, options?: AuthOptions): Promise<AuthResult> {
  const supabase = options?.supabase || getSupabaseClient(options?.req, options?.res);

  // Check if username is already taken in profiles table
  const existingUsername = await findProfileByUsername(input.username, options?.dbOverride);
  if (existingUsername) {
    return {
      user: null,
      session: null,
      profile: null,
      error: 'Username is already taken',
    };
  }

  // Check new passwords before they reach Supabase Auth. Routine login is intentionally unaffected.
  try {
    const passwordIsBreached = await isPasswordPwned(input.password);
    if (passwordIsBreached) {
      return {
        user: null,
        session: null,
        profile: null,
        error: 'This password appears in known data breaches. Please choose a different password.',
      };
    }
  } catch {
    // Fail closed without exposing or logging the submitted password, hash, or HIBP response.
    return {
      user: null,
      session: null,
      profile: null,
      error: 'Password security check is temporarily unavailable. Please try again in a moment.',
    };
  }

  // The approval is issued only after the HIBP check above succeeds. Supabase's
  // Before User Created hook consumes it atomically for the matching email, but
  // cannot bind it to the password Auth receives. The bypass risk remains (#118).
  let signupApprovalId: string | undefined;
  if (config.SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED) {
    signupApprovalId = randomUUID();
    try {
      await createPasswordCheckedSignupApproval(signupApprovalId, input.email, options?.dbOverride);
    } catch {
      return {
        user: null,
        session: null,
        profile: null,
        error: 'Account creation is temporarily unavailable. Please try again in a moment.',
      };
    }
  }

  const callbackUrl = new URL('/auth/callback', config.APP_BASE_URL);
  callbackUrl.searchParams.set('next', sanitizeRedirectUrl(options?.signupNextUrl, '/profile'));

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      data: {
        username: input.username,
        display_name: input.displayName || input.username,
        ...(signupApprovalId ? { signup_approval_id: signupApprovalId } : {}),
      },
    },
  });

  if (error || !data.user) {
    return {
      user: null,
      session: null,
      profile: null,
      error: error?.message || 'Failed to create user account',
    };
  }

  // Detect Supabase's obfuscated duplicate-signup response where data.user exists but identities is empty
  if (data.user.identities && data.user.identities.length === 0) {
    return {
      user: data.user,
      session: null,
      profile: null,
      requiresEmailConfirmation: true,
    };
  }

  const profile = await ensureProfileForUser(data.user, input.username, options?.dbOverride);

  return {
    user: data.user,
    session: data.session,
    profile,
    requiresEmailConfirmation: !data.session,
  };
}

export async function login(input: LoginInput, options?: AuthOptions): Promise<AuthResult> {
  const supabase = options?.supabase || getSupabaseClient(options?.req, options?.res);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.user || !data.session) {
    return {
      user: null,
      session: null,
      profile: null,
      error: error?.message || 'Invalid email or password',
    };
  }

  const profile = await ensureProfileForUser(data.user, undefined, options?.dbOverride);

  return {
    user: data.user,
    session: data.session,
    profile,
  };
}

export async function getGoogleOAuthUrl(redirectTo?: string, options?: AuthOptions): Promise<string> {
  const supabase = options?.supabase || getSupabaseClient(options?.req, options?.res);
  const callbackUrl = redirectTo || `${config.APP_BASE_URL}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error || !data.url) {
    throw new Error(error?.message || 'Failed to initiate Google OAuth flow');
  }

  return data.url;
}

const ALLOWED_EMAIL_OTP_TYPES: EmailOtpType[] = [
  'recovery',
  'signup',
  'invite',
  'magiclink',
  'email_change',
  'email',
];

export async function handleAuthCallback(
  params: { code?: string; token_hash?: string; type?: string },
  options?: AuthOptions
): Promise<AuthResult> {
  const supabase = options?.supabase || getSupabaseClient(options?.req, options?.res);

  let data: { user: User | null; session: Session | null } | null = null;
  let error: { message: string } | null = null;
  let isRecoverySession = false;

  if (params.code) {
    const res = await supabase.auth.exchangeCodeForSession(params.code);
    data = res.data;
    error = res.error;
  } else if (params.token_hash && params.type) {
    if (!ALLOWED_EMAIL_OTP_TYPES.includes(params.type as EmailOtpType)) {
      return {
        user: null,
        session: null,
        profile: null,
        error: 'Invalid or unsupported verification token type',
      };
    }

    const otpType = params.type as EmailOtpType;
    if (otpType === 'recovery') {
      isRecoverySession = true;
    }

    const res = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: otpType,
    });
    data = res.data;
    error = res.error;
  } else {
    return {
      user: null,
      session: null,
      profile: null,
      error: 'Missing authorization code or verification token',
    };
  }

  if (error || !data?.user || !data?.session) {
    return {
      user: null,
      session: null,
      profile: null,
      error: error?.message || 'Failed to authenticate session',
    };
  }

  const profile = await ensureProfileForUser(data.user, undefined, options?.dbOverride);

  return {
    user: data.user,
    session: data.session,
    profile,
    isRecoverySession,
  };
}

export async function handleOAuthCallback(code: string, options?: AuthOptions): Promise<AuthResult> {
  return handleAuthCallback({ code }, options);
}

export async function sendPasswordResetEmail(
  email: string,
  redirectTo: string,
  options?: AuthOptions
): Promise<{ error?: string }> {
  const supabase = options?.supabase || getSupabaseClient(options?.req, options?.res);

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function updatePassword(password: string, options?: AuthOptions): Promise<AuthResult> {
  const supabase = options?.supabase || getSupabaseClient(options?.req, options?.res);

  // Extract access and refresh tokens from express request cookies / session
  const accessToken =
    options?.req?.cookies?.['sb-access-token'] ||
    options?.req?.session?.access_token ||
    (options?.req?.headers?.authorization?.startsWith('Bearer ')
      ? options.req.headers.authorization.split(' ')[1]
      : undefined);

  const refreshToken =
    options?.req?.cookies?.['sb-refresh-token'] || options?.req?.session?.refresh_token;

  if (!accessToken || !refreshToken) {
    return {
      user: null,
      session: null,
      profile: null,
      error: 'Auth session missing! Please request a new password reset email.',
    };
  }

  // Explicitly initialize the session on the Supabase client instance before updating user
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError || !sessionData?.session) {
    return {
      user: null,
      session: null,
      profile: null,
      error: sessionError?.message || 'Auth session missing! Please request a new password reset email.',
    };
  }

  // Check new passwords before they reach Supabase Auth.
  try {
    const passwordIsBreached = await isPasswordPwned(password);
    if (passwordIsBreached) {
      return {
        user: null,
        session: null,
        profile: null,
        error: 'This password appears in known data breaches. Please choose a different password.',
      };
    }
  } catch {
    // Fail closed without exposing or logging the submitted password, hash, or HIBP response.
    return {
      user: null,
      session: null,
      profile: null,
      error: 'Password security check is temporarily unavailable. Please try again in a moment.',
    };
  }

  const { data, error } = await supabase.auth.updateUser({ password });

  if (error || !data.user) {
    return {
      user: null,
      session: null,
      profile: null,
      error: error?.message || 'Failed to update password',
    };
  }

  // Revoke the recovery session using the same client that holds the setSession() state.
  // The controller will clear the browser cookies regardless; a revocation failure must not
  // turn an already-successful password update into a misleading failed-reset response.
  try {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) {
      console.error('[auth:updatePassword] Session revocation failed after password update');
    }
  } catch {
    console.error('[auth:updatePassword] Session revocation failed after password update');
  }

  return {
    user: data.user,
    session: null,
    profile: null,
  };
}

export async function getUserFromToken(accessToken: string, supabaseClient?: SupabaseClient): Promise<User | null> {
  const supabase = supabaseClient || getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

export async function refreshSession(
  refreshToken: string,
  supabaseClient?: SupabaseClient
): Promise<{ user: User | null; session: Session | null }> {
  const supabase = supabaseClient || getSupabaseClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session || !data.user) {
    return { user: null, session: null };
  }

  return { user: data.user, session: data.session };
}

export async function signOut(options?: AuthOptions): Promise<void> {
  const supabase = options?.supabase || getSupabaseClient(options?.req, options?.res);
  await supabase.auth.signOut({ scope: 'local' });
}
