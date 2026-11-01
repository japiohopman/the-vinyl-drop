export type DatabaseEnvironment = 'development' | 'staging' | 'production' | 'test';

export function getPostgresConnectionOptions(environment: DatabaseEnvironment) {
  if (environment === 'staging' || environment === 'production') {
    return { ssl: 'require' as const };
  }

  return {};
}
