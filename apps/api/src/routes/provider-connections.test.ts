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
    resolveUser:         async () => null,
    verifyKey:           async () => 'ok',
    upsertConnection:    async () => mockMeta(),
    findConnection:      async () => null,
    listConnections:     async () => [],
    deleteConnection:    async () => undefined,
    getDecryptedKeyById: async () => null,
    pingConnection:      async () => 'ok',
    checkRateLimit:      () => ({ ok: true, retryAfterSecs: 0 }),
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

  it('returns 400 invalid_body when apiKey is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await put(baseUrl, '/v1/provider-connections/openai', {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('invalid_body');
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

describe('POST /v1/provider-connections/:id/test', () => {
  const CONN_ID = 'conn-abc-123';

  it('returns 401 when unauthenticated', async () => {
    const { baseUrl, close } = await startServer(makeDeps());
    const res = await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
    await close();
  });

  it('returns 404 when the connection id does not belong to the user', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_1,
      getDecryptedKeyById: async () => null,
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('not_found');
    await close();
  });

  it("scopes lookup to the caller's user id and the url :id param", async () => {
    let receivedUserId: string | null = null;
    let receivedId: string | null = null;
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_2,
      getDecryptedKeyById: async (userId, id) => {
        receivedUserId = userId;
        receivedId = id;
        return null;
      },
    }));
    await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(receivedUserId).toBe(USER_2.id);
    expect(receivedId).toBe(CONN_ID);
    await close();
  });

  it('returns { ok: true } on successful provider ping', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_1,
      getDecryptedKeyById: async () => ({ provider: 'openai', apiKey: 'sk-stored-key' }),
      pingConnection:      async () => 'ok',
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ ok: true }>;
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data).toEqual({ ok: true });
    await close();
  });

  it('forwards the stored provider and decrypted key to pingConnection', async () => {
    let receivedProvider: string | null = null;
    let receivedKey: string | null = null;
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_1,
      getDecryptedKeyById: async () => ({ provider: 'openai', apiKey: 'sk-fwd' }),
      pingConnection:      async (provider, apiKey) => {
        receivedProvider = provider;
        receivedKey = apiKey;
        return 'ok';
      },
    }));
    await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(receivedProvider).toBe('openai');
    expect(receivedKey).toBe('sk-fwd');
    await close();
  });

  it('returns { ok: false, code: "provider_auth_error" } when provider rejects the key', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_1,
      getDecryptedKeyById: async () => ({ provider: 'openai', apiKey: 'sk-bad' }),
      pingConnection:      async () => 'unauthorized',
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ ok: false; code: string; message: string }>;
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data.ok).toBe(false);
    expect(body.data.code).toBe('provider_auth_error');
    expect(typeof body.data.message).toBe('string');
    await close();
  });

  it('returns { ok: false, code: "provider_error" } when provider is unreachable', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_1,
      getDecryptedKeyById: async () => ({ provider: 'openai', apiKey: 'sk-ok' }),
      pingConnection:      async () => 'provider_error',
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ ok: false; code: string; message: string }>;
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data.ok).toBe(false);
    expect(body.data.code).toBe('provider_error');
    await close();
  });

  it('never leaks the decrypted key in the response body', async () => {
    const secret = 'sk-ultra-secret-stored';
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_1,
      getDecryptedKeyById: async () => ({ provider: 'openai', apiKey: secret }),
      pingConnection:      async () => 'unauthorized',
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    const text = await res.text();
    expect(text).not.toContain(secret);
    await close();
  });

  it('returns 429 when rate limit is exceeded and keys by connection id', async () => {
    const seen: string[] = [];
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:         async () => USER_1,
      getDecryptedKeyById: async () => ({ provider: 'openai', apiKey: 'sk-ok' }),
      checkRateLimit:      (key) => {
        seen.push(key);
        return { ok: false, retryAfterSecs: 60 };
      },
    }));
    const res = await fetch(`${baseUrl}/v1/provider-connections/${CONN_ID}/test`, { method: 'POST' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('rate_limited');
    expect(res.headers.get('retry-after')).toBe('60');
    expect(seen).toEqual([CONN_ID]);
    await close();
  });
});
