import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { workspaces } from './schema.js';
import { findProjectById } from './projects.repo.js';

export type Db = PostgresJsDatabase;

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
