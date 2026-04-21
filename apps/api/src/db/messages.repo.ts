import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { MessageRole } from '@webapp/types';
import { messages } from './schema.js';
import { findChatWindowById } from './chat-windows.repo.js';

export type Db = PostgresJsDatabase;

/**
 * Returns messages for the chat window, or null if the chat window doesn't
 * exist or its parent workspace/project chain is not owned by userId.
 */
export async function listMessagesByChatWindowAndUser(
  db: Db,
  chatWindowId: string,
  userId: string,
) {
  const cw = await findChatWindowById(db, chatWindowId, userId);
  if (!cw) return null;
  return db.select().from(messages).where(eq(messages.chatWindowId, chatWindowId));
}

/**
 * Creates a message, or returns null if the chat window doesn't exist or
 * its parent chain is not owned by userId.
 */
export async function createMessage(
  db: Db,
  chatWindowId: string,
  userId: string,
  role: MessageRole,
  content: string,
) {
  const cw = await findChatWindowById(db, chatWindowId, userId);
  if (!cw) return null;
  const [row] = await db
    .insert(messages)
    .values({ chatWindowId, role, content })
    .returning();
  return row!;
}

/**
 * Returns the message, or null if it doesn't exist or its parent chat-window
 * chain is not owned by userId.
 */
export async function findMessageById(db: Db, id: string, userId: string) {
  const [msg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1);
  if (!msg) return null;
  const cw = await findChatWindowById(db, msg.chatWindowId, userId);
  return cw ? msg : null;
}
