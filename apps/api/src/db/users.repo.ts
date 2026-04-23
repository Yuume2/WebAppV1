import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { users } from './schema.js';

export type Db = PostgresJsDatabase;

export async function findUserByEmail(db: Db, email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function findUserById(db: Db, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function createUser(
  db: Db,
  email: string,
  passwordHash: string,
  displayName?: string,
) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, displayName })
    .returning();
  return user!;
}
