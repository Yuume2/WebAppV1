import type { IncomingMessage } from 'node:http';
import type { AIProvider, Message, MessageRole } from '@webapp/types';
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
import { env } from '../config/env.js';
import type { Db } from '../db/messages.repo.js';
import * as messagesRepo from '../db/messages.repo.js';
import * as chatWindowsRepo from '../db/chat-windows.repo.js';
import { getDecryptedApiKey } from '../db/provider-connections.repo.js';
import { createOpenAIClient } from '../providers/openai.provider.js';
import type { ChatCompletionResult, ChatMessage } from '../providers/provider.interface.js';

// ── Internal DB row shapes ────────────────────────────────────────────────────

interface DbMessage {
  id: string;
  chatWindowId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

interface DbChatWindow {
  id: string;
  workspaceId: string;
  title: string;
  provider: AIProvider;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Deps ──────────────────────────────────────────────────────────────────────

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

export interface MessagesDeps {
  resolveUser:    (req: IncomingMessage) => Promise<{ id: string } | null>;
  listMessages:   (chatWindowId: string, userId: string) => Promise<DbMessage[] | null>;
  createMessage:  (chatWindowId: string, userId: string, role: MessageRole, content: string) => Promise<DbMessage | null>;
  findMessage:    (id: string, userId: string) => Promise<DbMessage | null>;
  // Provider generation deps — used only when posting a user message to an openai chat window.
  findChatWindow:    (chatWindowId: string, userId: string) => Promise<DbChatWindow | null>;
  getApiKey:         (userId: string, provider: AIProvider) => Promise<string | null>;
  generate:          (apiKey: string, messages: ChatMessage[], model: string) => Promise<ChatCompletionResult>;
  maxContextMessages: number;
}

export function makeMessagesDeps(db: Db, sessionDeps: SessionDeps): MessagesDeps {
  return {
    resolveUser:    (req)                                 => resolveCurrentUser(req, sessionDeps),
    listMessages:   (chatWindowId, userId)                => messagesRepo.listMessagesByChatWindowAndUser(db, chatWindowId, userId),
    createMessage:  (chatWindowId, userId, role, content) => messagesRepo.createMessage(db, chatWindowId, userId, role, content),
    findMessage:    (id, userId)                          => messagesRepo.findMessageById(db, id, userId),
    findChatWindow:    (chatWindowId, userId)              => chatWindowsRepo.findChatWindowById(db, chatWindowId, userId),
    getApiKey:         (userId, provider)                  => getDecryptedApiKey(db, userId, provider),
    generate:          (apiKey, msgs, model)               => createOpenAIClient(apiKey).createChatCompletion(msgs, model),
    maxContextMessages: env.openaiMaxContextMessages,
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

  const chatWindowId = body.chatWindowId;
  const role = body.role as MessageRole;
  const content = body.content;

  // For user messages: resolve the chat window to determine whether to trigger AI generation.
  if (role === 'user') {
    const cw = await deps.findChatWindow(chatWindowId, user.id);
    if (cw === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);

    if (cw.provider === 'openai') {
      const apiKey = await deps.getApiKey(user.id, 'openai');
      if (!apiKey) {
        return respondError(
          'validation_error',
          'No OpenAI connection configured. Add your API key in provider settings.',
          400,
        );
      }

      // Build context from existing messages + the new user message (not yet persisted).
      // Generating BEFORE persisting keeps the DB clean if the provider call fails.
      // Only the most recent maxContextMessages prior messages are included to bound
      // the context size sent to the provider.
      const history = await deps.listMessages(chatWindowId, user.id);
      const recentHistory = (history ?? []).slice(-deps.maxContextMessages);
      const contextMessages: ChatMessage[] = [
        ...recentHistory.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
        { role: 'user', content },
      ];

      let completion: ChatCompletionResult;
      try {
        completion = await deps.generate(apiKey, contextMessages, cw.model);
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Unknown provider error';
        return respondError('internal_error', `Provider call failed: ${detail}`, 502);
      }

      // Persist user message then assistant reply.
      const userRow = await deps.createMessage(chatWindowId, user.id, 'user', content);
      if (userRow === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);

      const assistantRow = await deps.createMessage(chatWindowId, user.id, 'assistant', completion.content);
      if (assistantRow === null) {
        return respondError('internal_error', 'Failed to persist assistant message', 500);
      }

      return respondCreated(
        { userMessage: toMessage(userRow), assistantMessage: toMessage(assistantRow) },
        getMessagePath(userRow.id),
      );
    }

    // Non-openai provider: persist user message only, no generation.
    // Provider support for this window is not yet enabled.
  }

  // Default path: persist the message as-is (non-user role, or non-openai provider).
  const row = await deps.createMessage(chatWindowId, user.id, role, content);
  if (row === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);
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
