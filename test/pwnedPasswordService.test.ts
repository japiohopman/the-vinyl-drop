import { isPasswordPwned, PasswordCheckUnavailableError } from '../src/app/services/pwnedPasswordService';

function response(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

function mockFetch(body: string, status = 200): typeof fetch {
  return jest.fn().mockResolvedValue(response(body, status)) as unknown as typeof fetch;
}

describe('HIBP Pwned Passwords range lookup', () => {
  const breachedSuffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

  it('detects a known breached password by comparing the full hash suffix locally', async () => {
    const fetchImpl = mockFetch(`${breachedSuffix}:123456\nABCDEF0123456789ABCDEF0123456789ABC:0\n`);

    await expect(isPasswordPwned('password', { fetchImpl })).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(url).not.toContain(breachedSuffix);
    expect(init.headers).toEqual({
      'Add-Padding': 'true',
      'User-Agent': 'the-vinyl-drop-password-security-check/1.0',
    });
  });

  it('allows a password when the matching suffix is absent from the range', async () => {
    const fetchImpl = mockFetch(`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:7\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:0\n`);

    await expect(isPasswordPwned('A different strong test password! 2026', { fetchImpl })).resolves.toBe(false);
  });

  it('treats a zero-count padding entry as not breached', async () => {
    const fetchImpl = mockFetch(`${breachedSuffix}:0\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:4\n`);

    await expect(isPasswordPwned('password', { fetchImpl })).resolves.toBe(false);
  });

  it('fails closed on a non-success HTTP status', async () => {
    await expect(isPasswordPwned('password', { fetchImpl: mockFetch('temporarily unavailable', 503) }))
      .rejects.toBeInstanceOf(PasswordCheckUnavailableError);
  });

  it('fails closed on an empty or malformed response', async () => {
    await expect(isPasswordPwned('password', { fetchImpl: mockFetch('') }))
      .rejects.toBeInstanceOf(PasswordCheckUnavailableError);
    await expect(isPasswordPwned('password', { fetchImpl: mockFetch('not-a-valid-range-line') }))
      .rejects.toBeInstanceOf(PasswordCheckUnavailableError);
  });

  it('fails closed on network errors without forwarding the underlying error', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network error containing no safe UI detail'));

    await expect(isPasswordPwned('password', { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toEqual(expect.objectContaining({
        name: 'PasswordCheckUnavailableError',
        message: 'Password security lookup is unavailable',
      }));
  });

  it('aborts a lookup that exceeds the configured timeout', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn().mockImplementation(
        (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      ) as unknown as typeof fetch;

      const pending = isPasswordPwned('password', { fetchImpl, timeoutMs: 25 });
      await jest.advanceTimersByTimeAsync(25);

      await expect(pending).rejects.toBeInstanceOf(PasswordCheckUnavailableError);
    } finally {
      jest.useRealTimers();
    }
  });
});
