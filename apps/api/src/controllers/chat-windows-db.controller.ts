import type { IncomingMessage } from 'node:http';
import type { AIProvider, ChatWindow } from '@webapp/types';
import { getChatWindowPath } from '@webapp/types';
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
import type { Db } from '../db/chat-windows.repo.js';
import * as chatWindowsRepo from '../db/chat-windows.repo.js';

// ── Internal DB row shape ──────────────────────────────────────────────────────

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

export interface ChatWindowsDeps {
  resolveUser: (req: IncomingMessage) => Promise<{ id: string } | null>;
  listChatWindows: (workspaceId: string, userId: string) => Promise<DbChatWindow[] | null>;
  createChatWindow: (workspaceId: string, userId: string, title: string, provider: AIProvider, model: string) => Promise<DbChatWindow | null>;
  findChatWindow: (id: string, userId: string) => Promise<DbChatWindow | null>;
}

export function makeChatWindowsDeps(db: Db, sessionDeps: SessionDeps): ChatWindowsDeps {
  return {
    resolveUser:      (req)                               => resolveCurrentUser(req, sessionDeps),
    listChatWindows:  (workspaceId, userId)               => chatWindowsRepo.listChatWindowsByWorkspaceAndUser(db, workspaceId, userId),
    createChatWindow: (workspaceId, userId, title, provider, model) => chatWindowsRepo.createChatWindow(db, workspaceId, userId, title, provider, model),
    findChatWindow:   (id, userId)                        => chatWindowsRepo.findChatWindowById(db, id, userId),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

const AI_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'perplexity'];

function isAIProvider(v: unknown): v is AIProvider {
  return AI_PROVIDERS.includes(v as AIProvider);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toChatWindow(row: DbChatWindow): ChatWindow {
  return {
    id:          row.id,
    workspaceId: row.workspaceId,
    title:       row.title,
    provider:    row.provider,
    model:       row.model,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function listChatWindowsDbController(
  ctx: RequestContext,
  deps: ChatWindowsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const workspaceId = ctx.url.searchParams.get('workspaceId') ?? '';
  if (!workspaceId) return respondError('validation_error', 'Query param workspaceId is required');

  const rows = await deps.listChatWindows(workspaceId, user.id);
  if (rows === null) return respondNotFound(`Workspace ${workspaceId} not found`);
  return respond(rows.map(toChatWindow));
}

export async function createChatWindowDbController(
  ctx: RequestContext,
  deps: ChatWindowsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const bodyResult = await readJsonBody(ctx.req);
  if (!bodyResult.ok) return bodyResult.result;
  const body = bodyResult.data;

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    return respondError('validation_error', 'workspaceId is required');
  }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return respondError('validation_error', 'title is required and must be a non-empty string');
  }
  if (!isAIProvider(body.provider)) {
    return respondError('validation_error', `provider must be one of: ${AI_PROVIDERS.join(', ')}`);
  }
  if (typeof body.model !== 'string' || !body.model.trim()) {
    return respondError('validation_error', 'model is required and must be a non-empty string');
  }

  const row = await deps.createChatWindow(
    body.workspaceId,
    user.id,
    body.title.trim(),
    body.provider as AIProvider,
    body.model.trim(),
  );
  if (row === null) return respondNotFound(`Workspace ${body.workspaceId} not found`);
  const cw = toChatWindow(row);
  return respondCreated(cw, getChatWindowPath(cw.id));
}

export async function getChatWindowDbController(
  ctx: RequestContext,
  deps: ChatWindowsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const row = await deps.findChatWindow(id, user.id);
  return row ? respond(toChatWindow(row)) : respondNotFound(`ChatWindow ${id} not found`);
}
