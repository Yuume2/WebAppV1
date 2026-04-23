import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AIProvider } from '@webapp/types';
import { chatWindows } from './schema.js';
import { findWorkspaceById } from './workspaces.repo.js';

export type Db = PostgresJsDatabase;

/**
 * Returns chat windows for the workspace, or null if the workspace doesn't
 * exist or its parent project is not owned by userId.
 */
export async function listChatWindowsByWorkspaceAndUser(
  db: Db,
  workspaceId: string,
  userId: string,
) {
  const ws = await findWorkspaceById(db, workspaceId, userId);
  if (!ws) return null;
  return db.select().from(chatWindows).where(eq(chatWindows.workspaceId, workspaceId));
}

/**
 * Creates a chat window, or returns null if the workspace doesn't exist or
 * its parent project is not owned by userId.
 */
export async function createChatWindow(
  db: Db,
  workspaceId: string,
  userId: string,
  title: string,
  provider: AIProvider,
  model: string,
) {
  const ws = await findWorkspaceById(db, workspaceId, userId);
  if (!ws) return null;
  const [row] = await db
    .insert(chatWindows)
    .values({ workspaceId, title, provider, model })
    .returning();
  return row!;
}

/**
 * Returns id + workspaceId for all chat windows belonging to the given workspace IDs.
 * Used to populate windowIds on Workspace responses without loading full rows.
 */
export async function listWindowIdsByWorkspaceIds(
  db: PostgresJsDatabase,
  workspaceIds: string[],
): Promise<Array<{ id: string; workspaceId: string }>> {
  if (workspaceIds.length === 0) return [];
  return db
    .select({ id: chatWindows.id, workspaceId: chatWindows.workspaceId })
    .from(chatWindows)
    .where(inArray(chatWindows.workspaceId, workspaceIds));
}

/**
 * Returns the chat window, or null if it doesn't exist or its parent workspace
 * chain is not owned by userId.
 */
export async function findChatWindowById(db: Db, id: string, userId: string) {
  const [cw] = await db
    .select()
    .from(chatWindows)
    .where(eq(chatWindows.id, id))
    .limit(1);
  if (!cw) return null;
  const ws = await findWorkspaceById(db, cw.workspaceId, userId);
  return ws ? cw : null;
}
