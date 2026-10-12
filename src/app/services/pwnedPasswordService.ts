import { createHash } from 'node:crypto';

const HIBP_RANGE_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const HIBP_USER_AGENT = 'the-vinyl-drop-password-security-check/1.0';
const DEFAULT_TIMEOUT_MS = 3_000;

export class PasswordCheckUnavailableError extends Error {
  constructor() {
    super('Password security lookup is unavailable');
    this.name = 'PasswordCheckUnavailableError';
  }
}

export interface PwnedPasswordOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Checks a password with the HIBP k-anonymity range API.
 *
 * Only the first five characters of the SHA-1 lookup hash are sent to HIBP.
 * The full hash and raw password are kept in memory and are never logged or
 * persisted by this service. Any lookup/response failure throws a generic
 * error so callers can fail closed without exposing lookup details.
 */
export async function isPasswordPwned(
  password: string,
  options: PwnedPasswordOptions = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    if (typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Invalid password lookup configuration');
    }

    const fullHash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = fullHash.slice(0, 5);
    const suffix = fullHash.slice(5);

    timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchImpl(`${HIBP_RANGE_ENDPOINT}${prefix}`, {
      method: 'GET',
      headers: {
        'Add-Padding': 'true',
        'User-Agent': HIBP_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Password lookup returned an unsuccessful status');
    }

    const body = await response.text();
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    if (lines.length === 0) {
      throw new Error('Password lookup returned an empty response');
    }

    let breached = false;

    for (const line of lines) {
      const match = /^([A-F0-9]{35}):(\d+)$/i.exec(line);
      if (!match) {
        throw new Error('Password lookup returned malformed data');
      }

      const prevalence = Number(match[2]);
      if (!Number.isSafeInteger(prevalence)) {
        throw new Error('Password lookup returned an invalid prevalence count');
      }

      // HIBP uses zero-count entries for Add-Padding responses. They are not hits.
      if (prevalence > 0 && match[1].toUpperCase() === suffix) {
        breached = true;
      }
    }

    return breached;
  } catch {
    // Deliberately do not forward the original error, response body, password,
    // or hash into logs, UI messages, or persistent state.
    throw new PasswordCheckUnavailableError();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
