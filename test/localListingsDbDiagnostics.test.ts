import postgres from 'postgres';
import { getSafeErrorLocations, getSafeErrorTypeChain, getSafeSqlState, isLoopbackPostgresUrl } from '../scripts/diagnoseLocalListingsDb';

describe('local listings DB diagnostic safety', () => {
  describe('isLoopbackPostgresUrl', () => {
    it.each([
      'postgres://postgres:postgres@localhost:54322/postgres',
      'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      'postgres://postgres:postgres@[::1]:5432/postgres',
    ])('allows loopback PostgreSQL URL %s', (url) => {
      expect(isLoopbackPostgresUrl(url)).toBe(true);
    });

    it.each([
      undefined,
      '',
      'not a URL',
      'https://localhost/database',
      'postgres://user:password@db.example.com:5432/database',
      'postgres://user:password@host.docker.internal:5432/database',
    ])('rejects missing, malformed, or non-loopback URL %s', (url) => {
      expect(isLoopbackPostgresUrl(url)).toBe(false);
    });
  });

  describe('getSafeSqlState', () => {
    it('returns only a valid SQLSTATE from a postgres.js error', () => {
      const error = new Error('sensitive database message') as Error & { code?: unknown };
      Object.setPrototypeOf(error, postgres.PostgresError.prototype);
      error.code = '42703';

      expect(getSafeSqlState(error)).toBe('42703');
    });

    it('finds a validated SQLSTATE through a Drizzle-style cause wrapper', () => {
      const postgresError = new Error('sensitive database message') as Error & { code?: unknown };
      Object.setPrototypeOf(postgresError, postgres.PostgresError.prototype);
      postgresError.code = '42703';

      const wrappedError = Object.assign(new Error('wrapped query failure'), {
        cause: postgresError,
      });

      expect(getSafeSqlState(wrappedError)).toBe('42703');
    });

    it('does not expose non-Postgres errors or malformed codes', () => {
      const ordinaryError = Object.assign(new Error('private'), { code: 'EPIPE' });
      expect(getSafeSqlState(ordinaryError)).toBeUndefined();

      const malformedPostgresError = new Error('private') as Error & { code?: unknown };
      Object.setPrototypeOf(malformedPostgresError, postgres.PostgresError.prototype);
      malformedPostgresError.code = '42!03';

      expect(getSafeSqlState(malformedPostgresError)).toBeUndefined();

      const wrapperWithUntrustedCause = Object.assign(new Error('private'), {
        cause: Object.assign(new Error('private cause'), { code: '42703' }),
      });
      expect(getSafeSqlState(wrapperWithUntrustedCause)).toBeUndefined();
    });
  });
  
  describe('getSafeErrorTypeChain', () => {
    it('returns only allowlisted type labels and follows wrapped causes', () => {
      const postgresError = new Error('secret driver message') as Error & { code?: unknown };
      Object.setPrototypeOf(postgresError, postgres.PostgresError.prototype);
      postgresError.code = '42703';

      const wrapper = Object.assign(new Error('secret wrapper message'), {
        name: 'DrizzleQueryError',
        cause: postgresError,
      });

      expect(getSafeErrorTypeChain(wrapper)).toEqual(['DrizzleQueryError', 'PostgresError']);
    });

    it('normalizes arbitrary error names and protects against cause cycles', () => {
      const error = Object.assign(new Error('secret message'), {
        name: 'postgres-password-in-error-name',
      });
      Object.defineProperty(error, 'cause', { value: error });

      expect(getSafeErrorTypeChain(error)).toEqual(['OtherError']);
    });

    it('labels a non-error value without printing its contents', () => {
      expect(getSafeErrorTypeChain('private query data')).toEqual(['UnknownError']);
    });
  });
  
  describe('getSafeErrorLocations', () => {
    it('returns allowlisted source labels and positions without messages or paths', () => {
      const error = new TypeError('secret message with query text');
      error.stack = [
        'TypeError: secret message with query text',
        '    at searchListings (C:\\Users\\user\\repo\\src\\app\\repositories\\listingRepository.ts:135:24)',
        '    at async getHomeFeedListings (C:\\Users\\user\\repo\\src\\app\\services\\listingService.ts:89:17)',
        '    at run (C:\\Users\\user\\repo\\node_modules\\drizzle-orm\\utils.js:11:4)',
      ].join('\n');

      expect(getSafeErrorLocations(error)).toEqual([
        { source: 'listingRepository', line: 135, column: 24 },
        { source: 'listingService', line: 89, column: 17 },
        { source: 'drizzle-orm', line: 11, column: 4 },
      ]);
      expect(JSON.stringify(getSafeErrorLocations(error))).not.toContain('Users');
      expect(JSON.stringify(getSafeErrorLocations(error))).not.toContain('secret');
    });

    it('returns an empty list for errors without usable stack frames', () => {
      expect(getSafeErrorLocations('private value')).toEqual([]);
      expect(getSafeErrorLocations(new Error('secret but no stack frame'))).toEqual([]);
    });
  });
});
