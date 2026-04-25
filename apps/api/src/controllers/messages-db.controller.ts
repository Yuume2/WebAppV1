import type { IncomingMessage } from 'node:http';
import type { AIProvider, Message, MessageRole } from '@webapp/types';
import { getMessagePath } from '@webapp/types';
import {
  parseJsonBody,
  respond,
  respondCreated,
  respondError,
  respondNotFound,
  respondStreamed,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { s } from '../lib/schema.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import { env } from '../config/env.js';
import type { Db, AssistantMessageMetadata } from '../db/messages.repo.js';
import * as messagesRepo from '../db/messages.repo.js';
import * as chatWindowsRepo from '../db/chat-windows.repo.js';
import { getDecryptedApiKey } from '../db/provider-connections.repo.js';
import { createOpenAIClient } from '../providers/openai.provider.js';
import type {
  ChatCompletionResult,
  ChatCompletionStreamChunk,
  ChatMessage,
} from '../providers/provider.interface.js';

// ── Provider timeout guard ────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 30_000;
const PROVIDER_TIMEOUT_MESSAGE = 'provider_timeout';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(PROVIDER_TIMEOUT_MESSAGE)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ── Internal DB row shapes ────────────────────────────────────────────────────

interface DbMessage {
  id: string;
  chatWindowId: string;
  role: MessageRole;
  content: string;
  provider:         AIProvider | null;
  model:            string | null;
  promptTokens:     number | null;
  completionTokens: number | null;
  latencyMs:        number | null;
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
  persistMessagePair: (chatWindowId: string, userId: string, userContent: string, assistantContent: string, assistantMetadata?: AssistantMessageMetadata) => Promise<{ userRow: DbMessage; assistantRow: DbMessage } | null>;
  findMessage:    (id: string, userId: string) => Promise<DbMessage | null>;
  // Provider generation deps — used only when posting a user message to an openai chat window.
  findChatWindow:    (chatWindowId: string, userId: string) => Promise<DbChatWindow | null>;
  getApiKey:         (userId: string, provider: AIProvider) => Promise<string | null>;
  generate:          (apiKey: string, messages: ChatMessage[], model: string) => Promise<ChatCompletionResult>;
  generateStream:    (apiKey: string, messages: ChatMessage[], model: string) => AsyncIterable<ChatCompletionStreamChunk>;
  maxContextMessages: number;
  providerTimeoutMs?: number;
}

export function makeMessagesDeps(db: Db, sessionDeps: SessionDeps): MessagesDeps {
  return {
    resolveUser:    (req)                                 => resolveCurrentUser(req, sessionDeps),
    listMessages:   (chatWindowId, userId)                => messagesRepo.listMessagesByChatWindowAndUser(db, chatWindowId, userId),
    createMessage:  (chatWindowId, userId, role, content) => messagesRepo.createMessage(db, chatWindowId, userId, role, content),
    persistMessagePair: (chatWindowId, userId, userContent, assistantContent, assistantMetadata) => messagesRepo.insertMessagePair(db, chatWindowId, userId, userContent, assistantContent, assistantMetadata),
    findMessage:    (id, userId)                          => messagesRepo.findMessageById(db, id, userId),
    findChatWindow:    (chatWindowId, userId)              => chatWindowsRepo.findChatWindowById(db, chatWindowId, userId),
    getApiKey:         (userId, provider)                  => getDecryptedApiKey(db, userId, provider),
    generate:          (apiKey, msgs, model)               => createOpenAIClient(apiKey).createChatCompletion(msgs, model),
    generateStream:    (apiKey, msgs, model)               => createOpenAIClient(apiKey).createChatCompletionStream(msgs, model),
    maxContextMessages: env.openaiMaxContextMessages,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

const CreateMessageDbBody = s.object({
  chatWindowId: s.string({ min: 1 }),
  role:         s.enumOf<MessageRole>(MESSAGE_ROLES),
  content:      s.string({ min: 1, max: 32_000 }),
});

// ── Private helpers ───────────────────────────────────────────────────────────

function toMessage(row: DbMessage): Message {
  return {
    id:               row.id,
    chatWindowId:     row.chatWindowId,
    role:             row.role,
    content:          row.content,
    provider:         row.provider,
    model:            row.model,
    promptTokens:     row.promptTokens,
    completionTokens: row.completionTokens,
    latencyMs:        row.latencyMs,
    createdAt:        row.createdAt.toISOString(),
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

  const body = await parseJsonBody(ctx, CreateMessageDbBody);
  if (!body.ok) return body.result;

  const chatWindowId = body.value.chatWindowId;
  const role = body.value.role;
  const content = body.value.content;

  // For user messages: resolve the chat window to determine whether to trigger AI generation.
  if (role === 'user') {
    const cw = await deps.findChatWindow(chatWindowId, user.id);
    if (cw === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);

    if (cw.provider === 'openai') {
      const apiKey = await deps.getApiKey(user.id, 'openai');
      if (!apiKey) {
        return respondError(
          'provider_not_configured',
          'No OpenAI connection configured. Add your API key in provider settings.',
          412,
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
      const startedAt = Date.now();
      try {
        completion = await withTimeout(
          deps.generate(apiKey, contextMessages, cw.model),
          deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS,
        );
      } catch (err) {
        if (err instanceof Error && err.message === PROVIDER_TIMEOUT_MESSAGE) {
          return respondError('provider_error', 'Provider call timed out after 30s', 502);
        }
        const detail = err instanceof Error ? err.message : 'Unknown provider error';
        return respondError('provider_error', `Provider call failed: ${detail}`, 502);
      }
      const latencyMs = Date.now() - startedAt;

      // Provider metadata persisted on the assistant row only — describes the
      // call that produced the reply (cost tracking, observability, debugging).
      const assistantMetadata: AssistantMessageMetadata = {
        provider:         cw.provider,
        model:            completion.model,
        promptTokens:     completion.usage.promptTokens,
        completionTokens: completion.usage.completionTokens,
        latencyMs,
      };

      // Persist both messages atomically — if either insert fails, neither is committed.
      const pair = await deps.persistMessagePair(chatWindowId, user.id, content, completion.content, assistantMetadata);
      if (pair === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);

      return respondCreated(
        { userMessage: toMessage(pair.userRow), assistantMessage: toMessage(pair.assistantRow) },
        getMessagePath(pair.userRow.id),
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

// ── Streaming controller ──────────────────────────────────────────────────────

function sseWrite(res: import('node:http').ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function streamMessageDbController(
  ctx: RequestContext,
  deps: MessagesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const body = await parseJsonBody(ctx, CreateMessageDbBody);
  if (!body.ok) return body.result;
  if (body.value.role !== 'user') {
    return respondError('validation_error', 'Streaming is only supported for role=user messages', 400);
  }

  const chatWindowId = body.value.chatWindowId;
  const content = body.value.content;

  const cw = await deps.findChatWindow(chatWindowId, user.id);
  if (cw === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);
  if (cw.provider !== 'openai') {
    return respondError(
      'provider_not_configured',
      `Streaming is only supported for openai chat windows (got '${cw.provider}')`,
      412,
    );
  }
  const apiKey = await deps.getApiKey(user.id, 'openai');
  if (!apiKey) {
    return respondError(
      'provider_not_configured',
      'No OpenAI connection configured. Add your API key in provider settings.',
      412,
    );
  }

  const history = await deps.listMessages(chatWindowId, user.id);
  const recentHistory = (history ?? []).slice(-deps.maxContextMessages);
  const contextMessages: ChatMessage[] = [
    ...recentHistory.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    { role: 'user', content },
  ];

  const res = ctx.res;
  if (!res) return respondError('internal_error', 'Streaming requires a response object', 500);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Request-Id': ctx.requestId,
  });

  const startedAt = Date.now();
  let assistantContent = '';
  let model = cw.model;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let aborted = false;

  ctx.req.on('close', () => { aborted = true; });

  try {
    for await (const chunk of deps.generateStream(apiKey, contextMessages, cw.model)) {
      if (aborted) break;
      if (chunk.type === 'delta') {
        assistantContent += chunk.content;
        sseWrite(res, { delta: chunk.content });
      } else {
        model = chunk.model;
        usage = chunk.usage;
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown provider error';
    sseWrite(res, { error: detail });
    res.write('data: [DONE]\n\n');
    res.end();
    return respondStreamed(502);
  }

  if (aborted || assistantContent.length === 0) {
    // Client gave up or provider produced nothing — do NOT persist a half-baked pair.
    if (!aborted) sseWrite(res, { error: 'empty_response' });
    res.write('data: [DONE]\n\n');
    res.end();
    return respondStreamed(aborted ? 499 : 502);
  }

  const latencyMs = Date.now() - startedAt;
  const assistantMetadata: AssistantMessageMetadata = {
    provider:         'openai',
    model,
    promptTokens:     usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs,
  };

  const pair = await deps.persistMessagePair(chatWindowId, user.id, content, assistantContent, assistantMetadata);
  if (pair === null) {
    sseWrite(res, { error: 'chat_window_not_found' });
    res.write('data: [DONE]\n\n');
    res.end();
    return respondStreamed(404);
  }

  sseWrite(res, {
    done: true,
    userMessage:      toMessage(pair.userRow),
    assistantMessage: toMessage(pair.assistantRow),
  });
  res.write('data: [DONE]\n\n');
  res.end();
  return respondStreamed(200);
}
