import type { IncomingMessage } from 'node:http';
import type { Message, MessageRole } from '@webapp/types';
import { getMessagePath } from '@webapp/types';
import {
  isRecord,
  readJsonBody,
  respond,
  respondCreated,
  respondError,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import type { Db } from '../db/messages.repo.js';
import * as messagesRepo from '../db/messages.repo.js';

// ── Internal DB row shape ──────────────────────────────────────────────────────

interface DbMessage {
  id: string;
  chatWindowId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

// ── Deps ──────────────────────────────────────────────────────────────────────

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

export interface MessagesDeps {
  resolveUser: (req: IncomingMessage) => Promise<{ id: string } | null>;
  listMessages: (chatWindowId: string, userId: string) => Promise<DbMessage[] | null>;
  createMessage: (chatWindowId: string, userId: string, role: MessageRole, content: string) => Promise<DbMessage | null>;
  findMessage: (id: string, userId: string) => Promise<DbMessage | null>;
}

export function makeMessagesDeps(db: Db, sessionDeps: SessionDeps): MessagesDeps {
  return {
    resolveUser:   (req)                             => resolveCurrentUser(req, sessionDeps),
    listMessages:  (chatWindowId, userId)            => messagesRepo.listMessagesByChatWindowAndUser(db, chatWindowId, userId),
    createMessage: (chatWindowId, userId, role, content) => messagesRepo.createMessage(db, chatWindowId, userId, role, content),
    findMessage:   (id, userId)                      => messagesRepo.findMessageById(db, id, userId),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

const MESSAGE_ROLES: MessageRole[] = ['user', 'assistant', 'system'];

function isMessageRole(v: unknown): v is MessageRole {
  return MESSAGE_ROLES.includes(v as MessageRole);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toMessage(row: DbMessage): Message {
  return {
    id:           row.id,
    chatWindowId: row.chatWindowId,
    role:         row.role,
    content:      row.content,
    createdAt:    row.createdAt.toISOString(),
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function listMessagesDbController(
  ctx: RequestContext,
  deps: MessagesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const chatWindowId = ctx.url.searchParams.get('chatWindowId') ?? '';
  if (!chatWindowId) return respondError('validation_error', 'Query param chatWindowId is required');

  const rows = await deps.listMessages(chatWindowId, user.id);
  if (rows === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);
  return respond(rows.map(toMessage));
}

export async function createMessageDbController(
  ctx: RequestContext,
  deps: MessagesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const bodyResult = await readJsonBody(ctx.req);
  if (!bodyResult.ok) return bodyResult.result;
  const body = bodyResult.data;

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.chatWindowId !== 'string' || !body.chatWindowId) {
    return respondError('validation_error', 'chatWindowId is required');
  }
  if (!isMessageRole(body.role)) {
    return respondError('validation_error', `role must be one of: ${MESSAGE_ROLES.join(', ')}`);
  }
  if (typeof body.content !== 'string' || !body.content) {
    return respondError('validation_error', 'content is required and must be a non-empty string');
  }

  const row = await deps.createMessage(body.chatWindowId, user.id, body.role as MessageRole, body.content);
  if (row === null) return respondNotFound(`ChatWindow ${body.chatWindowId} not found`);
  const msg = toMessage(row);
  return respondCreated(msg, getMessagePath(msg.id));
}

export async function getMessageDbController(
  ctx: RequestContext,
  deps: MessagesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const row = await deps.findMessage(id, user.id);
  return row ? respond(toMessage(row)) : respondNotFound(`Message ${id} not found`);
}
