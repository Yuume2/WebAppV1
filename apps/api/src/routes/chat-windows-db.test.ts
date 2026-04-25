import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AIProvider, ApiResponse, ChatWindow } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeChatWindowDbRoutes } from './chat-windows-db.js';
import type { ChatWindowsDeps } from '../controllers/chat-windows-db.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_1 = { id: 'user-1', email: 'alice@example.com' };
const USER_2 = { id: 'user-2', email: 'bob@example.com' };

function mockChatWindow(workspaceId: string, overrides: Partial<{
  id: string; title: string; provider: AIProvider; model: string; createdAt: Date; updatedAt: Date;
}> = {}) {
  return {
    id:          'cw-1',
    workspaceId,
    title:       'My Chat',
    provider:    'openai' as AIProvider,
    model:       'gpt-4o',
    createdAt:   new Date('2026-01-01T00:00:00Z'),
    updatedAt:   new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ChatWindowsDeps> = {}): ChatWindowsDeps {
  return {
    resolveUser:      async () => null,
    listChatWindows:  async () => null,
    createChatWindow: async (workspaceId, _userId, title, provider, model) =>
      mockChatWindow(workspaceId, { title, provider, model }),
    findChatWindow:   async () => null,
    updateChatWindow: async () => null,
    deleteChatWindow: async () => false,
    ...overrides,
  };
}

async function startServer(deps: ChatWindowsDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll(makeChatWindowDbRoutes(deps));
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

function post(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(base: string, path: string) {
  return fetch(`${base}${path}`, { method: 'DELETE' });
}

// ── Unauthenticated access ────────────────────────────────────────────────────

describe('chat-window routes — unauthenticated', () => {
  let s: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => { s = await startServer(makeDeps()); });
  afterAll(async () => { await s.close(); });

  it('GET /v1/chat-windows returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/chat-windows?workspaceId=ws-1');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
  });

  it('POST /v1/chat-windows returns 401', async () => {
    const res = await post(s.baseUrl, '/v1/chat-windows', {
      workspaceId: 'ws-1', title: 'X', provider: 'openai', model: 'gpt-4o',
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/chat-windows/:id returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/chat-windows/some-id');
    expect(res.status).toBe(401);
  });
});

// ── List chat windows ─────────────────────────────────────────────────────────

describe('GET /v1/chat-windows — authenticated', () => {
  it('returns 400 when workspaceId query param is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/chat-windows');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    await close();
  });

  it('returns 404 when workspace is not owned by user', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      listChatWindows: async () => null,
    }));
    const res = await get(baseUrl, '/v1/chat-windows?workspaceId=other-ws');
    expect(res.status).toBe(404);
    await close();
  });

  it("returns user's chat windows for their workspace", async () => {
    const cws = [
      mockChatWindow('ws-1', { id: 'cw-1', title: 'Alpha' }),
      mockChatWindow('ws-1', { id: 'cw-2', title: 'Beta' }),
    ];
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      listChatWindows: async (workspaceId, userId) =>
        workspaceId === 'ws-1' && userId === USER_1.id ? cws : null,
    }));
    const res = await get(baseUrl, '/v1/chat-windows?workspaceId=ws-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ChatWindow[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(2);
    expect(body.data.map((c) => c.id)).toEqual(['cw-1', 'cw-2']);
    expect(body.data.every((c) => c.provider !== undefined && c.model !== undefined)).toBe(true);
    await close();
  });
});

// ── Create chat window ────────────────────────────────────────────────────────

describe('POST /v1/chat-windows — authenticated', () => {
  it('creates chat window under own workspace, returns 201 with location header', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      createChatWindow: async (workspaceId, _userId, title, provider, model) =>
        mockChatWindow(workspaceId, { id: 'new-cw', title, provider, model }),
    }));
    const res = await post(baseUrl, '/v1/chat-windows', {
      workspaceId: 'ws-1', title: 'New Chat', provider: 'anthropic', model: 'claude-3-5-sonnet',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<ChatWindow>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.title).toBe('New Chat');
    expect(body.data.provider).toBe('anthropic');
    expect(body.data.model).toBe('claude-3-5-sonnet');
    expect(res.headers.get('location')).toMatch(/\/v1\/chat-windows\//);
    await close();
  });

  it('returns 404 when workspace is not owned by user (cross-user rejection)', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      createChatWindow: async () => null,
    }));
    const res = await post(baseUrl, '/v1/chat-windows', {
      workspaceId: 'user2-ws', title: 'X', provider: 'openai', model: 'gpt-4o',
    });
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 400 when provider is invalid', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await post(baseUrl, '/v1/chat-windows', {
      workspaceId: 'ws-1', title: 'X', provider: 'unknown', model: 'gpt-4o',
    });
    expect(res.status).toBe(400);
    await close();
  });

  it('returns 400 when title is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await post(baseUrl, '/v1/chat-windows', {
      workspaceId: 'ws-1', provider: 'openai', model: 'gpt-4o',
    });
    expect(res.status).toBe(400);
    await close();
  });
});

// ── Get chat window by id ─────────────────────────────────────────────────────

describe('GET /v1/chat-windows/:id — user isolation', () => {
  it('returns own chat window', async () => {
    const cw = mockChatWindow('ws-1', { id: 'own-cw' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findChatWindow: async (id, userId) => (id === 'own-cw' && userId === USER_1.id) ? cw : null,
    }));
    const res = await get(baseUrl, '/v1/chat-windows/own-cw');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ChatWindow>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe('own-cw');
    expect(body.data.provider).toBe('openai');
    await close();
  });

  it("returns 404 for another user's chat window (does not reveal existence)", async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findChatWindow: async (_id, userId) => userId === USER_2.id ? mockChatWindow('ws-2') : null,
    }));
    const res = await get(baseUrl, '/v1/chat-windows/user2-cw');
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 404 for non-existent chat window', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/chat-windows/does-not-exist');
    expect(res.status).toBe(404);
    await close();
  });
});


describe("PATCH /v1/chat-windows/:id — authenticated", () => {
  it("renames a chat window owned by the user", async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      updateChatWindow: async (id, _userId, patchBody) =>
        mockChatWindow("ws-1", { id, title: patchBody.title ?? "CW" }),
    }));
    const res = await patch(baseUrl, "/v1/chat-windows/cw-1", { title: "Renamed" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ChatWindow>;
    if (!body.ok) throw new Error("expected ok");
    expect(body.data.title).toBe("Renamed");
    await close();
  });

  it("returns 404 when chat window belongs to another user", async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      updateChatWindow: async () => null,
    }));
    const res = await patch(baseUrl, "/v1/chat-windows/u2-cw", { title: "X" });
    expect(res.status).toBe(404);
    await close();
  });

  it("returns 400 invalid_body for empty title", async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await patch(baseUrl, "/v1/chat-windows/cw-1", { title: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error("expected error");
    expect(body.error.code).toBe("invalid_body");
    await close();
  });

  it("returns 401 when unauthenticated", async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => null }));
    const res = await patch(baseUrl, "/v1/chat-windows/cw-1", { title: "X" });
    expect(res.status).toBe(401);
    await close();
  });
});

describe("DELETE /v1/chat-windows/:id — authenticated", () => {
  it("returns 204 with empty body", async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      deleteChatWindow: async () => true,
    }));
    const res = await del(baseUrl, "/v1/chat-windows/cw-1");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    await close();
  });

  it("returns 404 when chat window belongs to another user", async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:      async () => USER_1,
      deleteChatWindow: async () => false,
    }));
    const res = await del(baseUrl, "/v1/chat-windows/u2-cw");
    expect(res.status).toBe(404);
    await close();
  });

  it("returns 401 when unauthenticated", async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => null }));
    const res = await del(baseUrl, "/v1/chat-windows/cw-1");
    expect(res.status).toBe(401);
    await close();
  });
});


