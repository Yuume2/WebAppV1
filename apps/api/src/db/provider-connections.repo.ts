import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AIProvider } from '@webapp/types';
import { providerConnections } from './schema.js';
import { encryptApiKey, decryptApiKey } from '../lib/api-key-cipher.js';

export type Db = PostgresJsDatabase;

// ── Safe public shape — never exposes plaintext secret ────────────────────────

export interface ProviderConnectionMeta {
  id: string;
  provider: AIProvider;
  createdAt: Date;
  updatedAt: Date;
}

function toMeta(row: typeof providerConnections.$inferSelect): ProviderConnectionMeta {
  return {
    id:        row.id,
    provider:  row.provider,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Inserts or replaces a provider connection for the given user.
 * The plaintext API key is encrypted before storage.
 * Returns safe metadata (no secret).
 */
export async function upsertProviderConnection(
  db: Db,
  userId: string,
  provider: AIProvider,
  plaintextApiKey: string,
): Promise<ProviderConnectionMeta> {
  const encryptedApiKey = encryptApiKey(plaintextApiKey);
  const now = new Date();
  const [row] = await db
    .insert(providerConnections)
    .values({ userId, provider, encryptedApiKey })
    .onConflictDoUpdate({
      target: [providerConnections.userId, providerConnections.provider],
      set: { encryptedApiKey, updatedAt: now },
    })
    .returning();
  return toMeta(row!);
}

/**
 * Returns the decrypted API key for a user-provider pair.
 * Returns null if no connection exists.
 * This is for internal server use only — never forward this to the client.
 */
export async function getDecryptedApiKey(
  db: Db,
  userId: string,
  provider: AIProvider,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(providerConnections)
    .where(and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, provider),
    ))
    .limit(1);
  if (!row) return null;
  return decryptApiKey(row.encryptedApiKey);
}

/**
 * Returns safe connection metadata for a user-provider pair.
 * Returns null if no connection exists.
 */
export async function findProviderConnection(
  db: Db,
  userId: string,
  provider: AIProvider,
): Promise<ProviderConnectionMeta | null> {
  const [row] = await db
    .select()
    .from(providerConnections)
    .where(and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, provider),
    ))
    .limit(1);
  return row ? toMeta(row) : null;
}

/**
 * Lists all provider connections for a user as safe metadata.
 * Never includes plaintext or encrypted secrets.
 */
export async function listProviderConnections(
  db: Db,
  userId: string,
): Promise<ProviderConnectionMeta[]> {
  const rows = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.userId, userId));
  return rows.map(toMeta);
}

/**
 * Removes a provider connection for the given user.
 */
export async function deleteProviderConnection(
  db: Db,
  userId: string,
  provider: AIProvider,
): Promise<void> {
  await db
    .delete(providerConnections)
    .where(and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, provider),
    ));
}
