import type { IncomingMessage } from 'node:http';
import type { AIProvider, ProviderConnection } from '@webapp/types';
import {
  isRecord,
  readJsonBody,
  respond,
  respondError,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import type { Db, ProviderConnectionMeta } from '../db/provider-connections.repo.js';
import * as providerRepo from '../db/provider-connections.repo.js';
import { verifyOpenAIKey } from '../providers/openai.provider.js';

// All recognised provider values — used to validate the :provider URL param.
const VALID_PROVIDERS = new Set<AIProvider>(['openai', 'anthropic', 'perplexity']);

// Providers supported for create/replace at this stage.
const ENABLED_PROVIDERS = new Set<AIProvider>(['openai']);

// ── Deps ──────────────────────────────────────────────────────────────────────

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

export interface ProviderConnectionsDeps {
  resolveUser:      (req: IncomingMessage) => Promise<{ id: string } | null>;
  verifyKey:        (provider: AIProvider, apiKey: string) => Promise<'ok' | 'unauthorized' | 'provider_error'>;
  upsertConnection: (userId: string, provider: AIProvider, apiKey: string) => Promise<ProviderConnectionMeta>;
  findConnection:   (userId: string, provider: AIProvider) => Promise<ProviderConnectionMeta | null>;
  listConnections:  (userId: string) => Promise<ProviderConnectionMeta[]>;
  deleteConnection: (userId: string, provider: AIProvider) => Promise<void>;
}

export function makeProviderConnectionsDeps(db: Db, sessionDeps: SessionDeps): ProviderConnectionsDeps {
  return {
    resolveUser:      (req)                   => resolveCurrentUser(req, sessionDeps),
    verifyKey:        (_provider, apiKey)     => verifyOpenAIKey(apiKey),
    upsertConnection: (userId, provider, key) => providerRepo.upsertProviderConnection(db, userId, provider, key),
    findConnection:   (userId, provider)      => providerRepo.findProviderConnection(db, userId, provider),
    listConnections:  (userId)                => providerRepo.listProviderConnections(db, userId),
    deleteConnection: (userId, provider)      => providerRepo.deleteProviderConnection(db, userId, provider),
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toResponse(meta: ProviderConnectionMeta): ProviderConnection {
  return {
    id:        meta.id,
    provider:  meta.provider,
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
  };
}

function parseProvider(raw: string): AIProvider | null {
  return VALID_PROVIDERS.has(raw as AIProvider) ? (raw as AIProvider) : null;
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function listConnectionsController(
  ctx: RequestContext,
  deps: ProviderConnectionsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const list = await deps.listConnections(user.id);
  return respond(list.map(toResponse));
}

export async function getConnectionController(
  ctx: RequestContext,
  deps: ProviderConnectionsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const provider = parseProvider(ctx.params['provider'] ?? '');
  if (!provider) return respondError('validation_error', 'Unknown provider', 400);

  const meta = await deps.findConnection(user.id, provider);
  return meta ? respond(toResponse(meta)) : respondNotFound(`No connection for provider '${provider}'`);
}

export async function upsertConnectionController(
  ctx: RequestContext,
  deps: ProviderConnectionsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const provider = parseProvider(ctx.params['provider'] ?? '');
  if (!provider) return respondError('validation_error', 'Unknown provider', 400);

  if (!ENABLED_PROVIDERS.has(provider)) {
    return respondError('validation_error', `Provider '${provider}' is not yet supported`, 400);
  }

  const bodyResult = await readJsonBody(ctx.req);
  if (!bodyResult.ok) return bodyResult.result;
  const body = bodyResult.data;

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body['apiKey'] !== 'string' || !body['apiKey'].trim()) {
    return respondError('validation_error', 'apiKey is required and must be a non-empty string');
  }

  const apiKey = body['apiKey'].trim();

  const verifyResult = await deps.verifyKey(provider, apiKey);
  if (verifyResult === 'unauthorized') {
    return respondError('provider_auth_error', 'API key is invalid or unauthorized', 401);
  }
  if (verifyResult === 'provider_error') {
    return respondError('provider_error', 'Could not reach the provider to validate the key — try again later', 502);
  }

  const meta = await deps.upsertConnection(user.id, provider, apiKey);
  return respond(toResponse(meta));
}

export async function deleteConnectionController(
  ctx: RequestContext,
  deps: ProviderConnectionsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const provider = parseProvider(ctx.params['provider'] ?? '');
  if (!provider) return respondError('validation_error', 'Unknown provider', 400);

  await deps.deleteConnection(user.id, provider);
  return respond(null);
}
