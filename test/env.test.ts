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

  it('treats a blank production diagnostic token as unset and validates configured tokens', () => {
    expect(validateEnv({
      NODE_ENV: 'test',
      PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN: '',
    }).PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN).toBeUndefined();

    const token = 'diagnostic-token-with-at-least-32-characters';
    expect(validateEnv({
      NODE_ENV: 'test',
      PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN: token,
    }).PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN).toBe(token);

    expect(() => validateEnv({
      NODE_ENV: 'test',
      PRODUCTION_RATE_LIMIT_DIAGNOSTIC_TOKEN: 'too-short',
    })).toThrow('Invalid environment configuration');
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

  it('keeps shared rate limits disabled in runtime environments until explicitly enabled', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).SHARED_RATE_LIMITS_ENABLED).toBe(true);
    expect(validateEnv({ NODE_ENV: 'test' }).SHARED_RATE_LIMITS_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(validateEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/development_db',
      SUPABASE_URL: 'https://development-project.supabase.co',
      SUPABASE_ANON_KEY: 'some-development-key',
    }).SHARED_RATE_LIMITS_ENABLED).toBe(false);

    const staging = {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
      SUPABASE_URL: 'https://staging-project.supabase.co',
      SUPABASE_ANON_KEY: 'some-staging-key',
      APP_BASE_URL: 'https://staging.vinyldrop.onrender.com',
      ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
      RECOVERY_SIGNING_SECRET: 'custom-staging-recovery-secret-key-32-bytes',
    };
    expect(validateEnv(staging).SHARED_RATE_LIMITS_ENABLED).toBe(false);
    expect(validateEnv({ ...staging, SHARED_RATE_LIMITS_ENABLED: '0' }).SHARED_RATE_LIMITS_ENABLED).toBe(false);
    expect(validateEnv({
      ...staging,
      SHARED_RATE_LIMITS_ENABLED: 'true',
      SHARED_RATE_LIMITS_SECRET: 'stable-shared-rate-limit-secret-32-bytes',
    }).SHARED_RATE_LIMITS_ENABLED).toBe(true);
    expect(() => validateEnv({ ...staging, SHARED_RATE_LIMITS_ENABLED: 'true' })).toThrow('Invalid environment configuration');
    expect(() => validateEnv({
      ...staging,
      SHARED_RATE_LIMITS_ENABLED: 'tru',
      SHARED_RATE_LIMITS_SECRET: 'stable-shared-rate-limit-secret-32-bytes',
    })).toThrow('Invalid environment configuration');
    expect(validateEnv({ ...staging, SHARED_RATE_LIMITS_ENABLED: 'false' }).SHARED_RATE_LIMITS_ENABLED).toBe(false);
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

  it('accepts 13 unique beta testers, deduplicates case-insensitively, and rejects 14 or malformed addresses', () => {
    const thirteenUniqueAddresses = Array.from(
      { length: 13 },
      (_, index) => `tester${index + 1}@example.com`
    ).join(',');
    const accepted = validateEnv({
      NODE_ENV: 'test',
      BETA_ALLOWED_EMAILS: thirteenUniqueAddresses,
    });
    expect(accepted.BETA_ALLOWED_EMAILS).toBe(thirteenUniqueAddresses);

    const duplicatesDoNotIncreaseTheUniqueCount = `${thirteenUniqueAddresses}, TESTER1@EXAMPLE.COM , tester2@example.com`;
    expect(validateEnv({
      NODE_ENV: 'test',
      BETA_ALLOWED_EMAILS: duplicatesDoNotIncreaseTheUniqueCount,
    }).BETA_ALLOWED_EMAILS).toBe(duplicatesDoNotIncreaseTheUniqueCount);

    const fourteenUniqueAddresses = Array.from(
      { length: 14 },
      (_, index) => `tester${index + 1}@example.com`
    ).join(',');
    expect(() => validateEnv({
      NODE_ENV: 'test',
      BETA_ALLOWED_EMAILS: fourteenUniqueAddresses,
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
        ALLOWED_REDIRECT_URLS: 'https://thevinyldrop.nl',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
