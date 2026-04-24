import type { IncomingMessage } from 'node:http';
import type { AIProvider, ProviderConnection } from '@webapp/types';
import {
  isRecord,
  readJsonBody,
  respond,
  respondError,
  respondNotFound,
  respondRateLimited,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import type { Db, ProviderConnectionMeta } from '../db/provider-connections.repo.js';
import * as providerRepo from '../db/provider-connections.repo.js';
import { verifyOpenAIKey } from '../providers/openai.provider.js';
import { RateLimiter, type RateLimitResult } from '../lib/rate-limiter.js';

const VALID_PROVIDERS = new Set<AIProvider>(['openai', 'anthropic', 'perplexity']);
const ENABLED_PROVIDERS = new Set<AIProvider>(['openai']);

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

export type PingResult = 'ok' | 'unauthorized' | 'provider_error';

export interface ProviderConnectionsDeps {
  resolveUser:         (req: IncomingMessage) => Promise<{ id: string } | null>;
  verifyKey:           (provider: AIProvider, apiKey: string) => Promise<'ok' | 'unauthorized' | 'provider_error'>;
  upsertConnection:    (userId: string, provider: AIProvider, apiKey: string) => Promise<ProviderConnectionMeta>;
  findConnection:      (userId: string, provider: AIProvider) => Promise<ProviderConnectionMeta | null>;
  listConnections:     (userId: string) => Promise<ProviderConnectionMeta[]>;
  deleteConnection:    (userId: string, provider: AIProvider) => Promise<void>;
  getDecryptedKeyById: (userId: string, id: string) => Promise<{ provider: AIProvider; apiKey: string } | null>;
  pingConnection:      (provider: AIProvider, apiKey: string) => Promise<PingResult>;
  checkRateLimit:      (key: string) => RateLimitResult;
}

const providerTestLimiter = new RateLimiter(1, 60 * 1000);

async function pingProvider(provider: AIProvider, apiKey: string): Promise<PingResult> {
  if (provider === 'openai') return verifyOpenAIKey(apiKey);
  return 'provider_error';
}

export function makeProviderConnectionsDeps(db: Db, sessionDeps: SessionDeps): ProviderConnectionsDeps {
  return {
    resolveUser:         (req)                   => resolveCurrentUser(req, sessionDeps),
    verifyKey:           (_provider, apiKey)     => verifyOpenAIKey(apiKey),
    upsertConnection:    (userId, provider, key) => providerRepo.upsertProviderConnection(db, userId, provider, key),
    findConnection:      (userId, provider)      => providerRepo.findProviderConnection(db, userId, provider),
    listConnections:     (userId)                => providerRepo.listProviderConnections(db, userId),
    deleteConnection:    (userId, provider)      => providerRepo.deleteProviderConnection(db, userId, provider),
    getDecryptedKeyById: (userId, id)            => providerRepo.getDecryptedApiKeyById(db, userId, id),
    pingConnection:      (provider, apiKey)      => pingProvider(provider, apiKey),
    checkRateLimit:      (key)                   => providerTestLimiter.check(key),
  };
}

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

export async function testConnectionController(
  ctx: RequestContext,
  deps: ProviderConnectionsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const connectionId = ctx.params['id'] ?? '';
  if (!connectionId) return respondError('validation_error', 'Missing connection id', 400);

  const record = await deps.getDecryptedKeyById(user.id, connectionId);
  if (!record) return respondNotFound(`No connection found with id '${connectionId}'`);

  const rl = deps.checkRateLimit(connectionId);
  if (!rl.ok) return respondRateLimited(rl.retryAfterSecs);

  const result = await deps.pingConnection(record.provider, record.apiKey);
  if (result === 'ok') return respond({ ok: true });

  if (result === 'unauthorized') {
    return respond({ ok: false, code: 'provider_auth_error', message: 'Provider rejected the stored key' });
  }
  return respond({ ok: false, code: 'provider_error', message: 'Could not reach the provider' });
}
