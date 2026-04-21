import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, Message, MessageRole } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeMessageDbRoutes } from './messages-db.js';
import type { MessagesDeps } from '../controllers/messages-db.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_1 = { id: 'user-1', email: 'alice@example.com' };
const USER_2 = { id: 'user-2', email: 'bob@example.com' };

function mockMessage(chatWindowId: string, overrides: Partial<{
  id: string; role: MessageRole; content: string; createdAt: Date;
}> = {}) {
  return {
    id:           'msg-1',
    chatWindowId,
    role:         'user' as MessageRole,
    content:      'Hello',
    createdAt:    new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<MessagesDeps> = {}): MessagesDeps {
  return {
    resolveUser:   async () => null,
    listMessages:  async () => null,
    createMessage: async (chatWindowId, _userId, role, content) => mockMessage(chatWindowId, { role, content }),
    findMessage:   async () => null,
    ...overrides,
  };
}

async function startServer(deps: MessagesDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll(makeMessageDbRoutes(deps));
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

// ── Unauthenticated access ────────────────────────────────────────────────────

describe('message routes — unauthenticated', () => {
  let s: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => { s = await startServer(makeDeps()); });
  afterAll(async () => { await s.close(); });

  it('GET /v1/messages returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/messages?chatWindowId=cw-1');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
  });

  it('POST /v1/messages returns 401', async () => {
    const res = await post(s.baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'user', content: 'Hi',
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/messages/:id returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/messages/some-id');
    expect(res.status).toBe(401);
  });
});

// ── List messages ─────────────────────────────────────────────────────────────

describe('GET /v1/messages — authenticated', () => {
  it('returns 400 when chatWindowId query param is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/messages');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    await close();
  });

  it('returns 404 when chat window is not owned by user', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:  async () => USER_1,
      listMessages: async () => null,
    }));
    const res = await get(baseUrl, '/v1/messages?chatWindowId=other-cw');
    expect(res.status).toBe(404);
    await close();
  });

  it("returns user's messages for their chat window", async () => {
    const msgs = [
      mockMessage('cw-1', { id: 'msg-1', role: 'user', content: 'Hello' }),
      mockMessage('cw-1', { id: 'msg-2', role: 'assistant', content: 'Hi there' }),
    ];
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:  async () => USER_1,
      listMessages: async (chatWindowId, userId) =>
        chatWindowId === 'cw-1' && userId === USER_1.id ? msgs : null,
    }));
    const res = await get(baseUrl, '/v1/messages?chatWindowId=cw-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Message[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(2);
    expect(body.data.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
    await close();
  });
});

// ── Create message ────────────────────────────────────────────────────────────

describe('POST /v1/messages — authenticated', () => {
  it('creates message under own chat window, returns 201 with location header', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:   async () => USER_1,
      createMessage: async (chatWindowId, _userId, role, content) =>
        mockMessage(chatWindowId, { id: 'new-msg', role, content }),
    }));
    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'user', content: 'Hello world',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<Message>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.content).toBe('Hello world');
    expect(body.data.role).toBe('user');
    expect(res.headers.get('location')).toMatch(/\/v1\/messages\//);
    await close();
  });

  it('returns 404 when chat window is not owned by user (cross-user rejection)', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:   async () => USER_1,
      createMessage: async () => null,
    }));
    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'user2-cw', role: 'user', content: 'Hi',
    });
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 400 when role is invalid', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'robot', content: 'Hi',
    });
    expect(res.status).toBe(400);
    await close();
  });

  it('returns 400 when content is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'user',
    });
    expect(res.status).toBe(400);
    await close();
  });
});

// ── Get message by id ─────────────────────────────────────────────────────────

describe('GET /v1/messages/:id — user isolation', () => {
  it('returns own message', async () => {
    const msg = mockMessage('cw-1', { id: 'own-msg' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:  async () => USER_1,
      findMessage:  async (id, userId) => (id === 'own-msg' && userId === USER_1.id) ? msg : null,
    }));
    const res = await get(baseUrl, '/v1/messages/own-msg');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Message>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe('own-msg');
    expect(body.data.role).toBe('user');
    await close();
  });

  it("returns 404 for another user's message (does not reveal existence)", async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:  async () => USER_1,
      findMessage:  async (_id, userId) => userId === USER_2.id ? mockMessage('cw-2') : null,
    }));
    const res = await get(baseUrl, '/v1/messages/user2-msg');
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 404 for non-existent message', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/messages/does-not-exist');
    expect(res.status).toBe(404);
    await close();
  });
});
