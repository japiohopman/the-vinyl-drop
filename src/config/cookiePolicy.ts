/**
 * Keep cookies carrying authentication/session state Secure outside local development/tests.
 * Render's staging service intentionally sets NODE_ENV=staging, so checking only "production"
 * would silently omit Secure from staging session and PKCE-verifier cookies.
 */
export function shouldUseSecureCookies(nodeEnv: string): boolean {
  return nodeEnv !== 'development' && nodeEnv !== 'test';
}
