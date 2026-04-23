import { eq, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sessions } from './schema.js';

export type Db = PostgresJsDatabase;

/** `tokenHash` is the SHA-256 hash of the raw session token; stored as the primary key. */
export async function createSession(
  db: Db,
  tokenHash: string,
  userId: string,
  expiresAt: Date,
) {
  const [session] = await db
    .insert(sessions)
    .values({ id: tokenHash, userId, expiresAt })
    .returning();
  return session!;
}

export async function findSessionByTokenHash(db: Db, tokenHash: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, tokenHash))
    .limit(1);
  return session ?? null;
}

export async function deleteSession(db: Db, tokenHash: string) {
  await db.delete(sessions).where(eq(sessions.id, tokenHash));
}

export async function deleteExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
