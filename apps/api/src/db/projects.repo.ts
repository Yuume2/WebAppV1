import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { projects } from './schema.js';

export type Db = PostgresJsDatabase;

export async function listProjectsByUserId(db: Db, userId: string) {
  return db.select().from(projects).where(eq(projects.userId, userId));
}

export async function createProject(db: Db, userId: string, name: string, description?: string) {
  const [row] = await db
    .insert(projects)
    .values({ userId, name, description })
    .returning();
  return row!;
}

export async function findProjectById(db: Db, id: string, userId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return row ?? null;
}
