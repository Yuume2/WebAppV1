import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';

/**
 * Returns a Drizzle DB instance connected to DATABASE_URL.
 * Throws clearly if the env var is not set — call only from code
 * that has confirmed DB support is required.
 */
export function createDb() {
  if (!env.databaseUrl) {
    throw new Error(
      'DATABASE_URL is required but not set. ' +
      'Add it to your .env.local or environment before using DB-backed routes.',
    );
  }
  const client = postgres(env.databaseUrl);
  return drizzle(client);
}
