import { getPostgresConnectionOptions } from '../src/db/connectionOptions';

describe('PostgreSQL connection options', () => {
  it.each(['staging', 'production'] as const)(
    'requires TLS for the hosted %s environment',
    (environment) => {
      expect(getPostgresConnectionOptions(environment)).toEqual({ ssl: 'require' });
    }
  );

  it.each(['development', 'test'] as const)(
    'does not force TLS for the local %s environment',
    (environment) => {
      expect(getPostgresConnectionOptions(environment)).toEqual({});
    }
  );
});
