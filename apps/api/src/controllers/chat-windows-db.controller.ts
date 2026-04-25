import type { IncomingMessage } from 'node:http';
import type { AIProvider, ChatWindow } from '@webapp/types';
import { getChatWindowPath } from '@webapp/types';
import {
  parseJsonBody,
  respond,
  respondCreated,
  respondError,
  respondNoContent,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { s } from '../lib/schema.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import type { Db, ChatWindowPatch } from '../db/chat-windows.repo.js';
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
  updateChatWindow: (id: string, userId: string, patch: ChatWindowPatch) => Promise<DbChatWindow | null>;
  deleteChatWindow: (id: string, userId: string) => Promise<boolean>;
}

export function makeChatWindowsDeps(db: Db, sessionDeps: SessionDeps): ChatWindowsDeps {
  return {
    resolveUser:      (req)                               => resolveCurrentUser(req, sessionDeps),
    listChatWindows:  (workspaceId, userId)               => chatWindowsRepo.listChatWindowsByWorkspaceAndUser(db, workspaceId, userId),
    createChatWindow: (workspaceId, userId, title, provider, model) => chatWindowsRepo.createChatWindow(db, workspaceId, userId, title, provider, model),
    findChatWindow:   (id, userId)                        => chatWindowsRepo.findChatWindowById(db, id, userId),
    updateChatWindow: (id, userId, patch)                 => chatWindowsRepo.updateChatWindow(db, id, userId, patch),
    deleteChatWindow: (id, userId)                        => chatWindowsRepo.deleteChatWindow(db, id, userId),
  };
}

// ── Body schemas ──────────────────────────────────────────────────────────────

const AI_PROVIDERS = ['openai', 'anthropic', 'perplexity'] as const;
const SUPPORTED_PROVIDERS = new Set<AIProvider>(['openai']);

const CreateChatWindowDbBody = s.object({
  workspaceId: s.string({ min: 1 }),
  title:       s.string({ min: 1, max: 200, trim: true }),
  provider:    s.enumOf<AIProvider>(AI_PROVIDERS),
  model:       s.string({ min: 1, max: 200, trim: true }),
});

const PatchChatWindowDbBody = s.object({
  title: s.optional(s.string({ min: 1, max: 200, trim: true })),
  model: s.optional(s.string({ min: 1, max: 200, trim: true })),
});

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

  const body = await parseJsonBody(ctx, CreateChatWindowDbBody);
  if (!body.ok) return body.result;

  if (!SUPPORTED_PROVIDERS.has(body.value.provider)) {
    return respondError(
      'validation_error',
      `Provider '${body.value.provider}' is not yet supported. Pick a supported provider (openai) — others land when their adapter ships.`,
      400,
    );
  }

  const row = await deps.createChatWindow(
    body.value.workspaceId,
    user.id,
    body.value.title,
    body.value.provider,
    body.value.model,
  );
  if (row === null) return respondNotFound(`Workspace ${body.value.workspaceId} not found`);
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

export async function patchChatWindowDbController(
  ctx: RequestContext,
  deps: ChatWindowsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const body = await parseJsonBody(ctx, PatchChatWindowDbBody);
  if (!body.ok) return body.result;

  const id = ctx.params['id'] ?? '';
  const row = await deps.updateChatWindow(id, user.id, body.value);
  return row ? respond(toChatWindow(row)) : respondNotFound(`ChatWindow ${id} not found`);
}

export async function deleteChatWindowDbController(
  ctx: RequestContext,
  deps: ChatWindowsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const deleted = await deps.deleteChatWindow(id, user.id);
  return deleted ? respondNoContent() : respondNotFound(`ChatWindow ${id} not found`);
}
