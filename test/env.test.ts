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

  it('should reject staging mode when DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
        SUPABASE_URL: 'https://staging-project.supabase.co',
        SUPABASE_ANON_KEY: 'some-staging-key',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should pass staging mode when required variables are present', () => {
    const env = validateEnv({
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/staging_db',
      SUPABASE_URL: 'https://staging-project.supabase.co',
      SUPABASE_ANON_KEY: 'some-staging-key',
      APP_BASE_URL: 'https://staging.vinyldrop.onrender.com',
      ALLOWED_REDIRECT_URLS: 'https://staging.vinyldrop.onrender.com',
    });
    expect(env.NODE_ENV).toBe('staging');
    expect(env.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/staging_db');
    expect(env.APP_BASE_URL).toBe('https://staging.vinyldrop.onrender.com');
  });

  it('should reject production mode when APP_BASE_URL is set to localhost', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@prod-db:5432/prod',
        SUPABASE_URL: 'https://prod-project.supabase.co',
        SUPABASE_ANON_KEY: 'prod-key',
        APP_BASE_URL: 'http://localhost:3000',
      })
    ).toThrow('Invalid environment configuration');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
