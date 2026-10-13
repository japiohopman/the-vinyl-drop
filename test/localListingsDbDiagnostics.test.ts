import postgres from 'postgres';
import { getSafeSqlState, isLoopbackPostgresUrl } from '../scripts/diagnoseLocalListingsDb';

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

    it('does not expose non-Postgres errors or malformed codes', () => {
      const ordinaryError = Object.assign(new Error('private'), { code: '42703' });
      expect(getSafeSqlState(ordinaryError)).toBeUndefined();

      const postgresError = new Error('private') as Error & { code?: unknown };
      Object.setPrototypeOf(postgresError, postgres.PostgresError.prototype);
      postgresError.code = 'EPIPE';

      expect(getSafeSqlState(postgresError)).toBeUndefined();
    });
  });
});
