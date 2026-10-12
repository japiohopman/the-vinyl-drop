import { shouldUseSecureCookies } from '../src/app/middleware/auth';

describe('Authentication cookie security flags', () => {
  it('requires Secure for staging and production cookies', () => {
    expect(shouldUseSecureCookies('staging')).toBe(true);
    expect(shouldUseSecureCookies('production')).toBe(true);
  });

  it('allows non-Secure cookies only in local development and tests', () => {
    expect(shouldUseSecureCookies('development')).toBe(false);
    expect(shouldUseSecureCookies('test')).toBe(false);
  });
});
