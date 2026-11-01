import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/env';
import * as schema from './schema';
import { getPostgresConnectionOptions } from './connectionOptions';

export const connectionString = config.DATABASE_URL || '';

// Hosted Supabase databases must never fall back to an unencrypted connection.
// Local development and tests may use loopback PostgreSQL without TLS.
export const queryClient = connectionString
  ? postgres(connectionString, getPostgresConnectionOptions(config.NODE_ENV))
  : null;

export const db = queryClient
  ? drizzle(queryClient, { schema })
  : (null as unknown as ReturnType<typeof drizzle<typeof schema>>);

let overrideDb: unknown = null;

export function setOverrideDb(customDb: unknown): void {
  overrideDb = customDb;
}

export function getDb(dbInstance = db) {
  if (overrideDb) {
    return overrideDb as typeof db;
  }
  if (!dbInstance) {
    throw new Error('Database connection not initialized. DATABASE_URL environment variable is missing.');
  }
  return dbInstance;
}
