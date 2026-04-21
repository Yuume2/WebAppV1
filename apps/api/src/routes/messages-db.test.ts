import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AIProvider, ApiResponse, GeneratedMessagePair, Message, MessageRole } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeMessageDbRoutes } from './messages-db.js';
import type { MessagesDeps } from '../controllers/messages-db.controller.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

function mockChatWindow(provider: AIProvider = 'anthropic', model = 'claude-3') {
  return {
    id:          'cw-1',
    workspaceId: 'ws-1',
    title:       'Test Window',
    provider,
    model,
    createdAt:   new Date('2026-01-01T00:00:00Z'),
    updatedAt:   new Date('2026-01-01T00:00:00Z'),
  };
}

function makeDeps(overrides: Partial<MessagesDeps> = {}): MessagesDeps {
  return {
    resolveUser:        async () => null,
    listMessages:       async () => null,
    createMessage:      async (chatWindowId, _userId, role, content) => mockMessage(chatWindowId, { role, content }),
    findMessage:        async () => null,
    // Default: non-openai window so existing tests bypass generation path.
    findChatWindow:     async () => mockChatWindow('anthropic'),
    getApiKey:          async () => null,
    generate:           async () => { throw new Error('should not be called in this test'); },
    maxContextMessages: 20,
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

// ── Create message — standard path (non-openai / non-user-role) ───────────────

describe('POST /v1/messages — standard path', () => {
  it('creates non-user-role message, returns 201 with location header', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:   async () => USER_1,
      createMessage: async (chatWindowId, _userId, role, content) =>
        mockMessage(chatWindowId, { id: 'new-msg', role, content }),
    }));
    // assistant role bypasses the openai generation path
    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'assistant', content: 'Replying manually',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<Message>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.content).toBe('Replying manually');
    expect(body.data.role).toBe('assistant');
    expect(res.headers.get('location')).toMatch(/\/v1\/messages\//);
    await close();
  });

  it('creates user message in non-openai window (anthropic), returns single message', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findChatWindow: async () => mockChatWindow('anthropic'),
      createMessage:  async (chatWindowId, _userId, role, content) =>
        mockMessage(chatWindowId, { id: 'new-msg', role, content }),
    }));
    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'user', content: 'Hello',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<Message>;
    if (!body.ok) throw new Error('expected ok');
    // Single message returned — no assistantMessage field
    expect(body.data.content).toBe('Hello');
    expect('assistantMessage' in body.data).toBe(false);
    await close();
  });

  it('returns 404 when chat window is not owned by user (cross-user rejection)', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:   async () => USER_1,
      createMessage: async () => null,
    }));
    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'user2-cw', role: 'assistant', content: 'Hi',
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

// ── Create message — OpenAI generation path ───────────────────────────────────

describe('POST /v1/messages — openai generation path', () => {
  it('user message to openai window: generates + persists assistant reply, returns both', async () => {
    const userMsg   = mockMessage('cw-1', { id: 'user-msg',   role: 'user',      content: 'Hello AI' });
    const assistMsg = mockMessage('cw-1', { id: 'asst-msg',   role: 'assistant', content: 'Hello human!' });

    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findChatWindow: async () => mockChatWindow('openai', 'gpt-4o-mini'),
      getApiKey:      async () => 'sk-test-key',
      listMessages:   async () => [],
      generate:       async () => ({ content: 'Hello human!', model: 'gpt-4o-mini', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } }),
      createMessage:  async (_cw, _uid, role) => role === 'user' ? userMsg : assistMsg,
    }));

    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'user', content: 'Hello AI',
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toMatch(/\/v1\/messages\//);

    const body = (await res.json()) as ApiResponse<GeneratedMessagePair>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.userMessage.id).toBe('user-msg');
    expect(body.data.userMessage.role).toBe('user');
    expect(body.data.userMessage.content).toBe('Hello AI');
    expect(body.data.assistantMessage.id).toBe('asst-msg');
    expect(body.data.assistantMessage.role).toBe('assistant');
    expect(body.data.assistantMessage.content).toBe('Hello human!');
    // API key must not appear in response
    expect(JSON.stringify(body)).not.toContain('sk-test-key');
    await close();
  });

  it('both messages belong to the same chat window', async () => {
    const userMsg   = mockMessage('cw-1', { id: 'u', role: 'user',      content: 'Q' });
    const assistMsg = mockMessage('cw-1', { id: 'a', role: 'assistant', content: 'A' });

    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findChatWindow: async () => mockChatWindow('openai', 'gpt-4o-mini'),
      getApiKey:      async () => 'sk-key',
      listMessages:   async () => [],
      generate:       async () => ({ content: 'A', model: 'gpt-4o-mini', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }),
      createMessage:  async (_cw, _uid, role) => role === 'user' ? userMsg : assistMsg,
    }));

    const res = await post(baseUrl, '/v1/messages', { chatWindowId: 'cw-1', role: 'user', content: 'Q' });
    const body = (await res.json()) as ApiResponse<GeneratedMessagePair>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.userMessage.chatWindowId).toBe('cw-1');
    expect(body.data.assistantMessage.chatWindowId).toBe('cw-1');
    await close();
  });

  it('missing OpenAI connection returns 400 with explicit error', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findChatWindow: async () => mockChatWindow('openai', 'gpt-4o-mini'),
      getApiKey:      async () => null,
    }));

    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'user', content: 'Hi',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('OpenAI');
    await close();
  });

  it('provider call failure returns 502 and does not persist any messages', async () => {
    let createCalled = false;
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      findChatWindow: async () => mockChatWindow('openai', 'gpt-4o-mini'),
      getApiKey:      async () => 'sk-key',
      listMessages:   async () => [],
      generate:       async () => { throw new Error('OpenAI API error: HTTP 500'); },
      createMessage:  async () => { createCalled = true; return mockMessage('cw-1'); },
    }));

    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'cw-1', role: 'user', content: 'Hi',
    });
    expect(res.status).toBe(502);
    // No messages persisted — generate failed before createMessage was called
    expect(createCalled).toBe(false);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('internal_error');
    // API key must not appear in error
    expect(body.error.message).not.toContain('sk-key');
    await close();
  });

  it('context is limited to last N prior messages (chronological order preserved)', async () => {
    const capturedMessages: Array<{ role: string; content: string }> = [];

    // History has 5 messages; maxContextMessages is 3 → only last 3 should be sent.
    const history = [
      mockMessage('cw-1', { id: 'm1', role: 'user',      content: 'old-1', createdAt: new Date('2026-01-01T00:00:01Z') }),
      mockMessage('cw-1', { id: 'm2', role: 'assistant', content: 'old-2', createdAt: new Date('2026-01-01T00:00:02Z') }),
      mockMessage('cw-1', { id: 'm3', role: 'user',      content: 'old-3', createdAt: new Date('2026-01-01T00:00:03Z') }),
      mockMessage('cw-1', { id: 'm4', role: 'assistant', content: 'old-4', createdAt: new Date('2026-01-01T00:00:04Z') }),
      mockMessage('cw-1', { id: 'm5', role: 'user',      content: 'old-5', createdAt: new Date('2026-01-01T00:00:05Z') }),
    ];

    const userMsg   = mockMessage('cw-1', { id: 'u', role: 'user',      content: 'new-q' });
    const assistMsg = mockMessage('cw-1', { id: 'a', role: 'assistant', content: 'reply' });

    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:        async () => USER_1,
      findChatWindow:     async () => mockChatWindow('openai', 'gpt-4o-mini'),
      getApiKey:          async () => 'sk-key',
      listMessages:       async () => history,
      maxContextMessages: 3,
      generate: async (_, msgs) => {
        capturedMessages.push(...msgs);
        return { content: 'reply', model: 'gpt-4o-mini', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
      },
      createMessage: async (_cw, _uid, role) => role === 'user' ? userMsg : assistMsg,
    }));

    await post(baseUrl, '/v1/messages', { chatWindowId: 'cw-1', role: 'user', content: 'new-q' });

    // Should have sent: old-3, old-4, old-5 (last 3) + new user message = 4 total
    expect(capturedMessages).toHaveLength(4);
    expect(capturedMessages[0]!.content).toBe('old-3');
    expect(capturedMessages[1]!.content).toBe('old-4');
    expect(capturedMessages[2]!.content).toBe('old-5');
    expect(capturedMessages[3]!.content).toBe('new-q');
    expect(capturedMessages[3]!.role).toBe('user');
    await close();
  });

  it('when history is shorter than maxContextMessages, all prior messages are sent', async () => {
    const capturedMessages: Array<{ role: string; content: string }> = [];

    const history = [
      mockMessage('cw-1', { id: 'm1', role: 'user',      content: 'hi' }),
      mockMessage('cw-1', { id: 'm2', role: 'assistant', content: 'hello' }),
    ];
    const userMsg   = mockMessage('cw-1', { id: 'u', role: 'user',      content: 'again' });
    const assistMsg = mockMessage('cw-1', { id: 'a', role: 'assistant', content: 'ok' });

    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:        async () => USER_1,
      findChatWindow:     async () => mockChatWindow('openai', 'gpt-4o-mini'),
      getApiKey:          async () => 'sk-key',
      listMessages:       async () => history,
      maxContextMessages: 20,
      generate: async (_, msgs) => {
        capturedMessages.push(...msgs);
        return { content: 'ok', model: 'gpt-4o-mini', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
      },
      createMessage: async (_cw, _uid, role) => role === 'user' ? userMsg : assistMsg,
    }));

    await post(baseUrl, '/v1/messages', { chatWindowId: 'cw-1', role: 'user', content: 'again' });

    // 2 history + 1 new user = 3 total
    expect(capturedMessages).toHaveLength(3);
    expect(capturedMessages[0]!.content).toBe('hi');
    expect(capturedMessages[2]!.content).toBe('again');
    await close();
  });

  it('persistence behavior is unchanged — both messages still written regardless of truncation', async () => {
    let createCallCount = 0;
    const userMsg   = mockMessage('cw-1', { id: 'u', role: 'user',      content: 'q' });
    const assistMsg = mockMessage('cw-1', { id: 'a', role: 'assistant', content: 'a' });

    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:        async () => USER_1,
      findChatWindow:     async () => mockChatWindow('openai', 'gpt-4o-mini'),
      getApiKey:          async () => 'sk-key',
      listMessages:       async () => [
        mockMessage('cw-1', { id: 'x1', content: 'old' }),
        mockMessage('cw-1', { id: 'x2', content: 'older' }),
      ],
      maxContextMessages: 1,
      generate: async () => ({ content: 'a', model: 'gpt-4o-mini', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }),
      createMessage: async (_cw, _uid, role) => { createCallCount++; return role === 'user' ? userMsg : assistMsg; },
    }));

    const res = await post(baseUrl, '/v1/messages', { chatWindowId: 'cw-1', role: 'user', content: 'q' });
    expect(res.status).toBe(201);
    // Both messages must have been persisted
    expect(createCallCount).toBe(2);
    await close();
  });

  it('cross-user: posting to another user\'s openai chat window returns 404', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      // Simulate repo returning null for user-1 (window owned by user-2)
      findChatWindow: async () => null,
    }));

    const res = await post(baseUrl, '/v1/messages', {
      chatWindowId: 'user2-cw', role: 'user', content: 'Hi',
    });
    expect(res.status).toBe(404);
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
