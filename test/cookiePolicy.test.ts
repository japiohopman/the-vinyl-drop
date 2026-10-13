import { shouldUseSecureCookies } from '../src/config/cookiePolicy';

describe('Authentication cookie Secure policy', () => {
  it('requires Secure for staging and production', () => {
    expect(shouldUseSecureCookies('staging')).toBe(true);
    expect(shouldUseSecureCookies('production')).toBe(true);
  });

  it('allows non-Secure cookies only in local development and tests', () => {
    expect(shouldUseSecureCookies('development')).toBe(false);
    expect(shouldUseSecureCookies('test')).toBe(false);
  });

  it('fails closed for an unknown runtime name', () => {
    expect(shouldUseSecureCookies('preview')).toBe(true);
  });
});
