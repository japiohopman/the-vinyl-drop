import { validateEnv } from '../src/config/env';

describe('Environment Validation', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should accept a valid PORT within range (e.g. 3000)', () => {
    const env = validateEnv({ PORT: '3000', NODE_ENV: 'test' });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });

  it('enables checked-signup approval by default only in tests; runtime modes require opt-in', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED).toBe(true);
    expect(validateEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/development_db',
      SUPABASE_URL: 'https://development-project.supabase.co',
      SUPABASE_ANON_KEY: 'some-development-key',
    }).SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED).toBe(false);
    const staging = {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
      SUPABASE_URL: 'https://staging-project.supabase.co',
      SUPABASE_ANON_KEY: 'some-staging-key',
      APP_BASE_URL: 'https://staging.vinyldrop.onrender.com',
      ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
      RECOVERY_SIGNING_SECRET: 'custom-staging-recovery-secret-key-32-bytes',
    };
    expect(validateEnv(staging).SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED).toBe(false);
    expect(validateEnv({ ...staging, SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: 'true' }).SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED).toBe(true);
  });

  it('keeps invite-only access opt-in and reads the private runtime allowlist', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).BETA_INVITE_ONLY_ENABLED).toBe(false);

    const enabled = validateEnv({
      NODE_ENV: 'test',
      BETA_INVITE_ONLY_ENABLED: 'true',
      BETA_ALLOWED_EMAILS: 'Tester@One.example, second@example.com, tester@one.example',
    });
    expect(enabled.BETA_INVITE_ONLY_ENABLED).toBe(true);
    expect(enabled.BETA_ALLOWED_EMAILS).toBe('Tester@One.example, second@example.com, tester@one.example');
  });

  it('rejects more than five unique beta testers or malformed allowlist addresses', () => {
    expect(() => validateEnv({
      NODE_ENV: 'test',
      BETA_ALLOWED_EMAILS: 'one@example.com,two@example.com,three@example.com,four@example.com,five@example.com,six@example.com',
    })).toThrow('Invalid environment configuration');

    expect(() => validateEnv({
      NODE_ENV: 'test',
      BETA_ALLOWED_EMAILS: 'valid@example.com,not-an-email',
    })).toThrow('Invalid environment configuration');
  });

  it('should reject PORT 0 (below min 1)', () => {
    expect(() => validateEnv({ PORT: '0', NODE_ENV: 'test' })).toThrow(
      'Invalid environment configuration'
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should reject PORT 65536 (above max 65535)', () => {
    expect(() => validateEnv({ PORT: '65536', NODE_ENV: 'test' })).toThrow(
      'Invalid environment configuration'
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should reject development mode when DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'some-key',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should pass development mode when DATABASE_URL, SUPABASE_URL, and SUPABASE_ANON_KEY are present', () => {
    const env = validateEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'some-key',
    });
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/test');
  });

  it('should reject staging mode when RECOVERY_SIGNING_SECRET is missing or under 32 characters', () => {
    // Missing RECOVERY_SIGNING_SECRET
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
        SUPABASE_URL: 'https://staging-project.supabase.co',
        SUPABASE_ANON_KEY: 'some-staging-key',
        APP_BASE_URL: 'https://staging.vinyldrop.onrender.com',
        ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Too short RECOVERY_SIGNING_SECRET (< 32 chars)
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
        SUPABASE_URL: 'https://staging-project.supabase.co',
        SUPABASE_ANON_KEY: 'some-staging-key',
        APP_BASE_URL: 'https://staging.vinyldrop.onrender.com',
        ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
        RECOVERY_SIGNING_SECRET: 'short-key',
      })
    ).toThrow('Invalid environment configuration');
  });

  it('should reject staging mode when APP_BASE_URL alone is missing', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
        SUPABASE_URL: 'https://staging-project.supabase.co',
        SUPABASE_ANON_KEY: 'some-staging-key',
        ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
        RECOVERY_SIGNING_SECRET: 'custom-staging-recovery-secret-key-32-bytes',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should reject staging mode when ALLOWED_REDIRECT_URLS alone is missing', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
        SUPABASE_URL: 'https://staging-project.supabase.co',
        SUPABASE_ANON_KEY: 'some-staging-key',
        APP_BASE_URL: 'https://staging.vinyldrop.onrender.com',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should reject staging mode when APP_BASE_URL is set to localhost', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
        SUPABASE_URL: 'https://staging-project.supabase.co',
        SUPABASE_ANON_KEY: 'some-staging-key',
        APP_BASE_URL: 'http://localhost:3000',
        ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should pass staging mode when all required variables are present', () => {
    const env = validateEnv({
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
      SUPABASE_URL: 'https://staging-project.supabase.co',
      SUPABASE_ANON_KEY: 'some-staging-key',
      APP_BASE_URL: 'https://staging.vinyldrop.onrender.com',
      ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
      RECOVERY_SIGNING_SECRET: 'custom-staging-recovery-secret-key-32-bytes',
    });
    expect(env.NODE_ENV).toBe('staging');
    expect(env.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/staging_db');
    expect(env.APP_BASE_URL).toBe('https://staging.vinyldrop.onrender.com');
    expect(env.RECOVERY_SIGNING_SECRET).toBe('custom-staging-recovery-secret-key-32-bytes');
  });

  it('should reject production mode when APP_BASE_URL is set to localhost', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@prod-db:5432/prod',
        SUPABASE_URL: 'https://prod-project.supabase.co',
        SUPABASE_ANON_KEY: 'prod-key',
        APP_BASE_URL: 'http://localhost:3000',
        ALLOWED_REDIRECT_URLS: 'https://vinyldrop.com',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
