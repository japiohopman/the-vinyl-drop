import { validateEnv } from '../src/config/env';

describe('Environment Validation', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should accept a valid PORT within range in test mode without DATABASE_URL', () => {
    const env = validateEnv({ PORT: '3000', NODE_ENV: 'test' });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });

  it('should require DATABASE_URL in development mode', () => {
    expect(() => validateEnv({ PORT: '3000', NODE_ENV: 'development' })).toThrow(
      'Invalid environment configuration'
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should accept valid configuration in development mode when DATABASE_URL is provided', () => {
    const env = validateEnv({
      PORT: '3000',
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
    });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/postgres');
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
});
