import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { projects } from './schema.js';

export type Db = PostgresJsDatabase;

export interface ProjectPatch {
  name?: string;
  description?: string | null;
}

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

export async function updateProject(
  db: Db,
  id: string,
  userId: string,
  patch: ProjectPatch,
) {
  const setClauses: Record<string, unknown> = { updatedAt: sql`now()` };
  if (patch.name !== undefined)        setClauses['name'] = patch.name;
  if (patch.description !== undefined) setClauses['description'] = patch.description;
  const [row] = await db
    .update(projects)
    .set(setClauses)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteProject(db: Db, id: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning({ id: projects.id });
  return rows.length > 0;
}
