import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { workspaces } from './schema.js';
import { findProjectById } from './projects.repo.js';

export type Db = PostgresJsDatabase;

export interface WorkspacePatch {
  name?: string;
}

/**
 * Returns workspaces for the project, or null if the project doesn't exist
 * or is not owned by userId.
 */
export async function listWorkspacesByProjectAndUser(
  db: Db,
  projectId: string,
  userId: string,
) {
  const project = await findProjectById(db, projectId, userId);
  if (!project) return null;
  return db.select().from(workspaces).where(eq(workspaces.projectId, projectId));
}

/**
 * Creates a workspace, or returns null if the project doesn't exist
 * or is not owned by userId.
 */
export async function createWorkspace(
  db: Db,
  projectId: string,
  userId: string,
  name: string,
) {
  const project = await findProjectById(db, projectId, userId);
  if (!project) return null;
  const [row] = await db.insert(workspaces).values({ projectId, name }).returning();
  return row!;
}

/**
 * Returns the workspace, or null if it doesn't exist or its parent project
 * is not owned by userId.
 */
export async function findWorkspaceById(db: Db, id: string, userId: string) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!ws) return null;
  const project = await findProjectById(db, ws.projectId, userId);
  return project ? ws : null;
}

/** Updates a workspace if owned (via project). Returns the updated row, or null. */
export async function updateWorkspace(
  db: Db,
  id: string,
  userId: string,
  patch: WorkspacePatch,
) {
  const existing = await findWorkspaceById(db, id, userId);
  if (!existing) return null;
  const setClauses: Record<string, unknown> = { updatedAt: sql`now()` };
  if (patch.name !== undefined) setClauses['name'] = patch.name;
  const [row] = await db
    .update(workspaces)
    .set(setClauses)
    .where(eq(workspaces.id, id))
    .returning();
  return row ?? null;
}

/** Deletes a workspace if owned. Returns true if deleted. Cascades via FK. */
export async function deleteWorkspace(db: Db, id: string, userId: string): Promise<boolean> {
  const existing = await findWorkspaceById(db, id, userId);
  if (!existing) return false;
  await db.delete(workspaces).where(eq(workspaces.id, id));
  return true;
}
