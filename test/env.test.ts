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
});
