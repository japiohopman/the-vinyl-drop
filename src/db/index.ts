import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/env';
import * as schema from './schema';

export const connectionString = config.DATABASE_URL || '';

export const queryClient = connectionString ? postgres(connectionString) : null;

export const db = queryClient
  ? drizzle(queryClient, { schema })
  : (null as unknown as ReturnType<typeof drizzle<typeof schema>>);

export function getDb() {
  if (!db) {
    throw new Error('Database connection not initialized. DATABASE_URL environment variable is missing.');
  }
  return db;
}
