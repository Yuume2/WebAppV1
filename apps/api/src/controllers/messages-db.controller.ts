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
import { requireUser } from '../lib/auth-helper.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import { captureException } from '../lib/sentry.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import type { Db, AssistantMessageMetadata } from '../db/messages.repo.js';
import * as messagesRepo from '../db/messages.repo.js';
import * as chatWindowsRepo from '../db/chat-windows.repo.js';
import { getDecryptedApiKey } from '../db/provider-connections.repo.js';
import { getProviderClient, isSupportedProvider } from '../providers/registry.js';
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
  // Provider generation deps — used when posting a user message to a chat window
  // whose provider has a working adapter (see SUPPORTED_PROVIDERS in providers/registry.ts).
  findChatWindow:    (chatWindowId: string, userId: string) => Promise<DbChatWindow | null>;
  getApiKey:         (userId: string, provider: AIProvider) => Promise<string | null>;
  generate:          (provider: AIProvider, apiKey: string, messages: ChatMessage[], model: string) => Promise<ChatCompletionResult>;
  generateStream:    (provider: AIProvider, apiKey: string, messages: ChatMessage[], model: string, opts?: { signal?: AbortSignal }) => AsyncIterable<ChatCompletionStreamChunk>;
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
    generate:          (provider, apiKey, msgs, model)     => getProviderClient(provider, apiKey).createChatCompletion(msgs, model),
    generateStream:    (provider, apiKey, msgs, model, opts) => getProviderClient(provider, apiKey).createChatCompletionStream(msgs, model, opts),
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
  const auth = await requireUser(ctx.req, deps.resolveUser);
  if (!auth.ok) return auth.result;
  const user = auth.user;

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
  const auth = await requireUser(ctx.req, deps.resolveUser);
  if (!auth.ok) return auth.result;
  const user = auth.user;

  const body = await parseJsonBody(ctx, CreateMessageDbBody);
  if (!body.ok) return body.result;

  const chatWindowId = body.value.chatWindowId;
  const role = body.value.role;
  const content = body.value.content;

  // For user messages: resolve the chat window to determine whether to trigger AI generation.
  if (role === 'user') {
    const cw = await deps.findChatWindow(chatWindowId, user.id);
    if (cw === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);

    if (isSupportedProvider(cw.provider)) {
      const apiKey = await deps.getApiKey(user.id, cw.provider);
      if (!apiKey) {
        return respondError(
          'provider_not_configured',
          `No ${cw.provider} connection configured. Add your API key in provider settings.`,
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
          deps.generate(cw.provider, apiKey, contextMessages, cw.model),
          deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS,
        );
      } catch (err) {
        captureException(err, { provider: cw.provider, model: cw.model, route: '/v1/messages' });
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

    // Provider unsupported (no adapter): persist user message only, no generation.
    // Reachable only if a chat-window was created with a provider that has since
    // been removed from SUPPORTED_PROVIDERS — defensive fall-through.
  }

  // Default path: persist the message as-is (non-user role, or unsupported provider).
  const row = await deps.createMessage(chatWindowId, user.id, role, content);
  if (row === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);
  const msg = toMessage(row);
  return respondCreated(msg, getMessagePath(msg.id));
}

export async function getMessageDbController(
  ctx: RequestContext,
  deps: MessagesDeps,
): Promise<InternalResult> {
  const auth = await requireUser(ctx.req, deps.resolveUser);
  if (!auth.ok) return auth.result;
  const user = auth.user;

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
  const auth = await requireUser(ctx.req, deps.resolveUser);
  if (!auth.ok) return auth.result;
  const user = auth.user;

  const body = await parseJsonBody(ctx, CreateMessageDbBody);
  if (!body.ok) return body.result;
  if (body.value.role !== 'user') {
    return respondError('validation_error', 'Streaming is only supported for role=user messages', 400);
  }

  const chatWindowId = body.value.chatWindowId;
  const content = body.value.content;

  const cw = await deps.findChatWindow(chatWindowId, user.id);
  if (cw === null) return respondNotFound(`ChatWindow ${chatWindowId} not found`);
  if (!isSupportedProvider(cw.provider)) {
    return respondError(
      'provider_not_configured',
      `Streaming is not supported for provider '${cw.provider}' yet`,
      412,
    );
  }
  const apiKey = await deps.getApiKey(user.id, cw.provider);
  if (!apiKey) {
    return respondError(
      'provider_not_configured',
      `No ${cw.provider} connection configured. Add your API key in provider settings.`,
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
  // Ship headers immediately so reverse proxies / browsers see the SSE
  // content-type before the first delta arrives — otherwise Node may buffer
  // the response start until enough body is queued, and proxies that
  // sniff content-type can decide to buffer the whole response.
  res.flushHeaders();

  // Keepalive comment ping: the SSE spec ignores any line starting with ":"
  // — every conformant client lib treats it as a no-op. Many reverse proxies
  // and load balancers drop "idle" connections after 30-60s of zero bytes,
  // which kills legitimate slow upstream responses. Sending a comment line
  // every 25s keeps the socket warm without surfacing anything in the
  // application-level event stream.
  const KEEPALIVE_MS = 25_000;
  // Idle-stream timeout: if the upstream provider hasn't produced a useful
  // delta in this many ms, we abort the call and surface an explicit SSE
  // error so the client can show a real failure instead of waiting forever
  // on a dead provider session. Keepalive bytes do NOT reset this — only
  // actual delta payloads. The chosen 90s window is wide enough for slow
  // first-tokens on large prompts but tight enough to catch hung sessions
  // before they tie up a reverse-proxy slot for the global request budget.
  const IDLE_TIMEOUT_MS = 90_000;
  const keepaliveTimer = setInterval(() => {
    // writableEnded guards against a race where the timer fires after we've
    // already res.end()'d in a terminal branch. write() on an ended response
    // would throw ERR_STREAM_WRITE_AFTER_END.
    if (res.writableEnded) return;
    try { res.write(':keepalive\n\n'); } catch { /* socket gone — close listener will clear */ }
  }, KEEPALIVE_MS);
  // unref so a leaked timer can never block process shutdown if a terminal
  // branch ever forgets to clear (defence in depth — every branch below
  // also calls cleanup() explicitly).
  keepaliveTimer.unref?.();

  const startedAt = Date.now();
  let assistantContent = '';
  let model = cw.model;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let aborted = false;
  let idleTimedOut = false;

  const upstreamAbort = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // Provider went silent past IDLE_TIMEOUT_MS. Mark idle, kill the
      // upstream call so we stop paying for a hung session, and let the
      // for-await loop throw — the catch block will see idleTimedOut=true
      // and emit the explicit SSE error.
      if (res.writableEnded) return;
      idleTimedOut = true;
      aborted = true;
      upstreamAbort.abort();
    }, IDLE_TIMEOUT_MS);
    idleTimer.unref?.();
  };
  // Centralised cleanup: every terminal branch (success / abort / error /
  // idle timeout) calls this exactly once. Listeners are removed so a late
  // 'close' or 'error' event after we've already ended the response can't
  // double-fire any of the cleanup logic.
  const onClose = (): void => {
    cleanup();
    if (!res.writableEnded) {
      aborted = true;
      upstreamAbort.abort();
    }
  };
  const onError = (): void => {
    cleanup();
    aborted = true;
    upstreamAbort.abort();
  };
  const cleanup = (): void => {
    clearInterval(keepaliveTimer);
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    res.off('close', onClose);
    res.off('error', onError);
  };

  // Cancel the upstream provider call when the downstream client drops the
  // connection — stops billing for tokens nobody will read. The for-await
  // loop will throw on read; we catch the abort below and return cleanly.
  // We listen on `res` (not `req`) because once the request body has been
  // fully read, Node's IncomingMessage 'close' event does not fire on
  // mid-response socket teardown — only the ServerResponse 'close' does.
  res.on('close', onClose);
  // A mid-stream socket error (ECONNRESET, EPIPE) emits 'error' on the
  // ServerResponse. With no listener, Node treats it as unhandled and the
  // process can crash. Treat it like a client disconnect: cancel upstream,
  // mark aborted, and swallow — the catch block downstream will see the
  // for-await throw and exit cleanly.
  res.on('error', onError);

  // Arm the idle timer before the first read. The provider may take a while
  // to produce its first token; 90s of total silence (no deltas, only our
  // keepalive bytes) is the threshold beyond which we treat the session as
  // hung and surface an explicit error.
  armIdleTimer();

  try {
    for await (const chunk of deps.generateStream(cw.provider, apiKey, contextMessages, cw.model, { signal: upstreamAbort.signal })) {
      if (aborted) break;
      if (chunk.type === 'delta') {
        // A useful delta only counts as activity if it carries content.
        // An empty-string delta is a provider quirk (some SDKs emit them as
        // "still alive" placeholders); we don't treat it as progress so a
        // provider that emits empty deltas indefinitely still trips the
        // idle timeout.
        if (chunk.content.length > 0) {
          assistantContent += chunk.content;
          sseWrite(res, { delta: chunk.content });
          armIdleTimer();
        }
      } else {
        model = chunk.model;
        usage = chunk.usage;
      }
    }
  } catch (err) {
    // Idle-timeout path: the upstream was aborted by us because no useful
    // delta had landed in IDLE_TIMEOUT_MS. Surface an explicit SSE error
    // so the client can distinguish this from a generic provider failure
    // or a client-side disconnect.
    if (idleTimedOut) {
      cleanup();
      logger.warn('stream aborted on idle timeout', {
        requestId: ctx.requestId,
        provider: cw.provider,
        model: cw.model,
        idleMs: IDLE_TIMEOUT_MS,
        partialBytes: assistantContent.length,
        durationMs: Date.now() - startedAt,
      });
      if (!res.writableEnded) {
        sseWrite(res, { error: 'idle_timeout', detail: `No provider activity for ${Math.floor(IDLE_TIMEOUT_MS / 1000)}s` });
        res.write('data: [DONE]\n\n');
        try { res.end(); } catch { /* socket already closed */ }
      }
      return respondStreamed(504);
    }
    // Aborted-by-us (client disconnected) is not a real error — the for-await
    // throw happens because we asked the upstream to stop. Don't ship an
    // 'error' SSE event (the client is gone anyway) and don't capture it.
    if (aborted) {
      cleanup();
      logger.info('stream cancelled by client disconnect', {
        requestId: ctx.requestId,
        provider: cw.provider,
        model: cw.model,
        partialBytes: assistantContent.length,
        durationMs: Date.now() - startedAt,
      });
      try { res.end(); } catch { /* socket already closed */ }
      return respondStreamed(499);
    }
    cleanup();
    captureException(err, { provider: cw.provider, model: cw.model, route: '/v1/messages/stream' });
    const detail = err instanceof Error ? err.message : 'Unknown provider error';
    sseWrite(res, { error: detail });
    res.write('data: [DONE]\n\n');
    res.end();
    return respondStreamed(502);
  }

  if (aborted || assistantContent.length === 0) {
    cleanup();
    // Client gave up or provider produced nothing — do NOT persist a half-baked pair.
    if (!aborted) sseWrite(res, { error: 'empty_response' });
    res.write('data: [DONE]\n\n');
    res.end();
    return respondStreamed(aborted ? 499 : 502);
  }

  const latencyMs = Date.now() - startedAt;
  const assistantMetadata: AssistantMessageMetadata = {
    provider:         cw.provider,
    model,
    promptTokens:     usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs,
  };

  const pair = await deps.persistMessagePair(chatWindowId, user.id, content, assistantContent, assistantMetadata);
  if (pair === null) {
    cleanup();
    sseWrite(res, { error: 'chat_window_not_found' });
    res.write('data: [DONE]\n\n');
    res.end();
    return respondStreamed(404);
  }

  cleanup();
  sseWrite(res, {
    done: true,
    userMessage:      toMessage(pair.userRow),
    assistantMessage: toMessage(pair.assistantRow),
  });
  res.write('data: [DONE]\n\n');
  res.end();
  logger.info('stream completed', {
    requestId:        ctx.requestId,
    provider:         cw.provider,
    model,
    promptTokens:     usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs,
  });
  return respondStreamed(200);
}
