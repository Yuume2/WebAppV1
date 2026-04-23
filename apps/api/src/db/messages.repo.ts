import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AIProvider, MessageRole } from '@webapp/types';
import { messages } from './schema.js';
import { findChatWindowById } from './chat-windows.repo.js';

export type Db = PostgresJsDatabase;

/**
 * Provider metadata attached to a provider-generated message. All fields
 * mirror the columns added to the `messages` table and are nullable at the
 * DB level; passing undefined omits the field from the insert.
 */
export interface AssistantMessageMetadata {
  provider:         AIProvider;
  model:            string;
  promptTokens:     number;
  completionTokens: number;
  latencyMs:        number;
}

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
  return db.select().from(messages)
    .where(eq(messages.chatWindowId, chatWindowId))
    .orderBy(asc(messages.createdAt));
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
 * Inserts a user message and assistant message atomically.
 * Returns null if the chat window doesn't exist or isn't owned by userId.
 * Either both rows are written or neither.
 *
 * Provider metadata (if supplied) is persisted on the assistant row only —
 * it describes the provider call that produced that reply. The user row
 * keeps its metadata columns null.
 */
export async function insertMessagePair(
  db: Db,
  chatWindowId: string,
  userId: string,
  userContent: string,
  assistantContent: string,
  assistantMetadata?: AssistantMessageMetadata,
): Promise<{ userRow: typeof messages.$inferSelect; assistantRow: typeof messages.$inferSelect } | null> {
  const cw = await findChatWindowById(db, chatWindowId, userId);
  if (!cw) return null;
  return db.transaction(async (tx) => {
    const [userRow] = await tx
      .insert(messages)
      .values({ chatWindowId, role: 'user', content: userContent })
      .returning();
    const [assistantRow] = await tx
      .insert(messages)
      .values({
        chatWindowId,
        role: 'assistant',
        content: assistantContent,
        ...(assistantMetadata ?? {}),
      })
      .returning();
    return { userRow: userRow!, assistantRow: assistantRow! };
  });
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
