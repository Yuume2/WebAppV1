import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ProviderConnection } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeProviderConnectionRoutes } from './provider-connections.js';
import type { ProviderConnectionsDeps } from '../controllers/provider-connections.controller.js';
import type { ProviderConnectionMeta } from '../db/provider-connections.repo.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_1 = { id: 'user-1', email: 'alice@example.com' };
const USER_2 = { id: 'user-2', email: 'bob@example.com' };

function mockMeta(overrides: Partial<ProviderConnectionMeta> = {}): ProviderConnectionMeta {
  return {
    id:        'conn-1',
    provider:  'openai',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ProviderConnectionsDeps> = {}): ProviderConnectionsDeps {
  return {
    resolveUser:      async () => null,
    verifyKey:        async () => 'ok',
    upsertConnection: async () => mockMeta(),
    findConnection:   async () => null,
    listConnections:  async () => [],
    deleteConnection: async () => undefined,
    getDecryptedKey:  async () => null,
    generate:         async () => ({ content: 'ok', model: 'gpt-4o-mini', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }),
    ...overrides,
  };
}

async function startServer(deps: ProviderConnectionsDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll(makeProviderConnectionRoutes(deps));
  const server: Server = createApiServer(router);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
  };
}

function get(base: string, path: string) {
  return fetch(`${base}${path}`);
}

function put(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(base: string, path: string) {
  return fetch(`${base}${path}`, { method: 'DELETE' });
}

// ── Unauthenticated ───────────────────────────────────────────────────────────

describe('provider-connection routes — unauthenticated', () => {
  let s: { baseUrl: string; close: () => Promise<void> };
  beforeAll(async () => { s = await startServer(makeDeps()); });
  afterAll(async () => { await s.close(); });

  it('GET /v1/provider-connections returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/provider-connections');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
  });

  it('GET /v1/provider-connections/openai returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/provider-connections/openai');
    expect(res.status).toBe(401);
  });

  it('PUT /v1/provider-connections/openai returns 401', async () => {
    const res = await put(s.baseUrl, '/v1/provider-connections/openai', { apiKey: 'sk-test' });
    expect(res.status).toBe(401);
  });

  it('DELETE /v1/provider-connections/openai returns 401', async () => {
    const res = await del(s.baseUrl, '/v1/provider-connections/openai');
    expect(res.status).toBe(401);
  });
});

// ── List ──────────────────────────────────────────────────────────────────────

describe('GET /v1/provider-connections — authenticated', () => {
  it('returns safe metadata — no apiKey field', async () => {
    const conn = mockMeta({ id: 'c1', provider: 'openai' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      listConnections: async () => [conn],
    }));

    const res = await get(baseUrl, '/v1/provider-connections');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ProviderConnection[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.id).toBe('c1');
    expect(body.data[0]!.provider).toBe('openai');
    expect('apiKey' in body.data[0]!).toBe(false);
    expect('encryptedApiKey' in body.data[0]!).toBe(false);
    await close();
  });

  it('returns empty array when user has no connections', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      listConnections: async () => [],
    }));
    const res = await get(baseUrl, '/v1/provider-connections');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ProviderConnection[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(0);
    await close();
  });

  it('cross-user isolation — only caller\'s connections are listed', async () => {
    const user1Conn = mockMeta({ id: 'u1-conn', provider: 'openai' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      listConnections: async (userId) => userId === USER_1.id ? [user1Conn] : [],
    }));
    const res = await get(baseUrl, '/v1/provider-connections');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ProviderConnection[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.id).toBe('u1-conn');
    await close();
  });
});

// ── Get by provider ───────────────────────────────────────────────────────────

describe('GET /v1/provider-connections/:provider — authenticated', () => {
  it('returns safe metadata for existing connection', async () => {
    const conn = mockMeta({ id: 'c2', provider: 'openai' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findConnection: async () => conn,
    }));
    const res = await get(baseUrl, '/v1/provider-connections/openai');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ProviderConnection>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.provider).toBe('openai');
    expect('apiKey' in body.data).toBe(false);
    await close();
  });

  it('returns 404 when no connection exists for that provider', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findConnection: async () => null,
    }));
    const res = await get(baseUrl, '/v1/provider-connections/openai');
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 400 for unknown provider param', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/provider-connections/unknown-provider');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    await close();
  });

  it('cross-user: user1 cannot see user2\'s connection (repo scopes by userId)', async () => {
    const user2Conn = mockMeta({ id: 'u2-conn', provider: 'openai' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      // Simulate repo that only returns connections for user2
      findConnection: async (userId) => userId === USER_2.id ? user2Conn : null,
    }));
    const res = await get(baseUrl, '/v1/provider-connections/openai');
    expect(res.status).toBe(404);
    await close();
  });
});

// ── Upsert ────────────────────────────────────────────────────────────────────

describe('PUT /v1/provider-connections/:provider — authenticated', () => {
  it('creates/updates openai connection, returns safe metadata', async () => {
    const stored = mockMeta({ id: 'new-conn', provider: 'openai' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      upsertConnection: async () => stored,
    }));
    const res = await put(baseUrl, '/v1/provider-connections/openai', { apiKey: 'sk-test-key' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ProviderConnection>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe('new-conn');
    expect(body.data.provider).toBe('openai');
    expect('apiKey' in body.data).toBe(false);
    expect('encryptedApiKey' in body.data).toBe(false);
    await close();
  });

  it('returns 400 when apiKey is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await put(baseUrl, '/v1/provider-connections/openai', {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    await close();
  });

  it('returns 400 when apiKey is empty string', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await put(baseUrl, '/v1/provider-connections/openai', { apiKey: '   ' });
    expect(res.status).toBe(400);
    await close();
  });

  it('returns 400 for unsupported but valid provider (anthropic)', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await put(baseUrl, '/v1/provider-connections/anthropic', { apiKey: 'sk-ant-test' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    await close();
  });

  it('returns 400 for unknown provider param', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await put(baseUrl, '/v1/provider-connections/gpt99', { apiKey: 'sk-test' });
    expect(res.status).toBe(400);
    await close();
  });

  it('invalid key — returns 401 provider_auth_error, upsertConnection not called', async () => {
    let upsertCalled = false;
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      verifyKey:        async () => 'unauthorized',
      upsertConnection: async () => { upsertCalled = true; return mockMeta(); },
    }));
    const res = await put(baseUrl, '/v1/provider-connections/openai', { apiKey: 'sk-bad-key' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('provider_auth_error');
    expect(upsertCalled).toBe(false);
    await close();
  });

  it('provider network error — returns 502 provider_error, upsertConnection not called', async () => {
    let upsertCalled = false;
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      verifyKey:        async () => 'provider_error',
      upsertConnection: async () => { upsertCalled = true; return mockMeta(); },
    }));
    const res = await put(baseUrl, '/v1/provider-connections/openai', { apiKey: 'sk-any-key' });
    expect(res.status).toBe(502);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('provider_error');
    expect(upsertCalled).toBe(false);
    await close();
  });

  it('error responses do not contain the plaintext key', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser: async () => USER_1,
      verifyKey:   async () => 'unauthorized',
    }));
    const res = await put(baseUrl, '/v1/provider-connections/openai', { apiKey: 'sk-super-secret-value' });
    const text = await res.text();
    expect(text).not.toContain('sk-super-secret-value');
    await close();
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe('DELETE /v1/provider-connections/:provider — authenticated', () => {
  it('deletes a connection and returns 200 null', async () => {
    let deleted = false;
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      deleteConnection: async () => { deleted = true; },
    }));
    const res = await del(baseUrl, '/v1/provider-connections/openai');
    expect(res.status).toBe(200);
    expect(deleted).toBe(true);
    const body = (await res.json()) as ApiResponse<null>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toBeNull();
    await close();
  });

  it('returns 400 for unknown provider param', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await del(baseUrl, '/v1/provider-connections/unknown');
    expect(res.status).toBe(400);
    await close();
  });
});

// ── Test connection ───────────────────────────────────────────────────────────

describe('POST /v1/provider-connections/openai/test', () => {
  it('returns 401 when unauthenticated', async () => {
    const { baseUrl, close } = await startServer(makeDeps());
    const res = await fetch(`${baseUrl}/v1/provider-connections/openai/test`, { method: 'POST' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
    await close();
  });

  it('returns 404 when no OpenAI connection is stored', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      getDecryptedKey: async () => null,
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/openai/test`, { method: 'POST' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('not_found');
    await close();
  });

  it('returns ok payload with provider/model/outputPreview on success', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      getDecryptedKey: async () => 'sk-stored-key',
      generate:        async () => ({ content: 'ok', model: 'gpt-4o-mini', usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 } }),
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/openai/test`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ provider: string; model: string; outputPreview: string }>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.provider).toBe('openai');
    expect(body.data.model).toBe('gpt-4o-mini');
    expect(body.data.outputPreview).toBe('ok');
    expect('apiKey' in body.data).toBe(false);
    await close();
  });

  it('returns 401 provider_auth_error when generate throws auth error', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      getDecryptedKey: async () => 'sk-bad-stored-key',
      generate:        async () => { throw new Error('OpenAI API error: 401 Unauthorized invalid_api_key'); },
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/openai/test`, { method: 'POST' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('provider_auth_error');
    expect(body.error.message).not.toContain('sk-bad-stored-key');
    await close();
  });

  it('returns 502 provider_error on network failure', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      getDecryptedKey: async () => 'sk-valid-key',
      generate:        async () => { throw new Error('fetch failed: connection refused'); },
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/openai/test`, { method: 'POST' });
    expect(res.status).toBe(502);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('provider_error');
    await close();
  });

  it('error responses never contain the stored plaintext key', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      getDecryptedKey: async () => 'sk-ultra-secret-stored',
      generate:        async () => { throw new Error('some error'); },
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/openai/test`, { method: 'POST' });
    const text = await res.text();
    expect(text).not.toContain('sk-ultra-secret-stored');
    await close();
  });
});
