import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase';
import { findProfileById, findProfileByUsername, createProfile } from '../repositories/profileRepository';
import { Profile } from '../../db/schema/profiles';
import { SignUpInput, LoginInput } from '../../validators/auth';
import { config } from '../../config/env';
import { getDb } from '../../db';

type DbInstance = ReturnType<typeof getDb>;

export interface AuthResult {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  error?: string;
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

export async function signUp(input: SignUpInput, dbOverride?: DbInstance): Promise<AuthResult> {
  const supabase = getSupabaseClient();

  // Check if username is already taken in profiles table
  const existingUsername = await findProfileByUsername(input.username, dbOverride);
  if (existingUsername) {
    return {
      user: null,
      session: null,
      profile: null,
      error: 'Username is already taken',
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        username: input.username,
        display_name: input.displayName || input.username,
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

  const profile = await ensureProfileForUser(data.user, input.username, dbOverride);

  return {
    user: data.user,
    session: data.session,
    profile,
  };
}

export async function login(input: LoginInput, dbOverride?: DbInstance): Promise<AuthResult> {
  const supabase = getSupabaseClient();

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

  const profile = await ensureProfileForUser(data.user, undefined, dbOverride);

  return {
    user: data.user,
    session: data.session,
    profile,
  };
}

export async function getGoogleOAuthUrl(redirectTo?: string): Promise<string> {
  const supabase = getSupabaseClient();
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

export async function handleOAuthCallback(code: string, dbOverride?: DbInstance): Promise<AuthResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user || !data.session) {
    return {
      user: null,
      session: null,
      profile: null,
      error: error?.message || 'Failed to exchange authorization code for session',
    };
  }

  const profile = await ensureProfileForUser(data.user, undefined, dbOverride);

  return {
    user: data.user,
    session: data.session,
    profile,
  };
}

export async function getUserFromToken(accessToken: string): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}
