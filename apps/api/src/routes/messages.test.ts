import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ChatWindow, Message, Workspace } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

async function createWorkspace(baseUrl: string): Promise<Workspace> {
  const res = await fetch(`${baseUrl}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'proj-1', name: 'WS' }),
  });
  const body = (await res.json()) as ApiResponse<Workspace>;
  if (!body.ok) throw new Error('setup: workspace');
  return body.data;
}

async function createChatWindow(baseUrl: string, workspaceId: string): Promise<ChatWindow> {
  const res = await fetch(`${baseUrl}/v1/chat-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, title: 'CW', provider: 'openai', model: 'gpt-4o' }),
  });
  const body = (await res.json()) as ApiResponse<ChatWindow>;
  if (!body.ok) throw new Error('setup: chat window');
  return body.data;
}

describe('GET /v1/messages', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns 400 when chatWindowId query param is missing', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/messages`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('validation_error');
  });

  it('returns empty list for a chat window with no messages', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const cw = await createChatWindow(harness.baseUrl, ws.id);
    const res = await fetch(`${harness.baseUrl}/v1/messages?chatWindowId=${cw.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Message[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data).toHaveLength(0);
  });
});

describe('POST /v1/messages', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates a message and returns 201', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const cw = await createChatWindow(harness.baseUrl, ws.id);

    const res = await fetch(`${harness.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatWindowId: cw.id, role: 'user', content: 'Hello' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<Message>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data.chatWindowId).toBe(cw.id);
    expect(body.data.role).toBe('user');
    expect(body.data.content).toBe('Hello');
    expect(res.headers.get('location')).toBe(`/v1/messages/${body.data.id}`);
  });

  it('created message is visible via GET with filter', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const cw = await createChatWindow(harness.baseUrl, ws.id);

    await fetch(`${harness.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatWindowId: cw.id, role: 'assistant', content: 'Hi there' }),
    });

    const res = await fetch(`${harness.baseUrl}/v1/messages?chatWindowId=${cw.id}`);
    const body = (await res.json()) as ApiResponse<Message[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].role).toBe('assistant');
  });

  it('returns 404 when chatWindowId does not exist', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatWindowId: 'nonexistent', role: 'user', content: 'Hi' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
  });

  it('returns 400 for invalid role', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const cw = await createChatWindow(harness.baseUrl, ws.id);
    const res = await fetch(`${harness.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatWindowId: cw.id, role: 'robot', content: 'Hi' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('validation_error');
  });
});
