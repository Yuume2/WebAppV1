import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ChatWindow, Workspace } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

async function createWorkspace(baseUrl: string, projectId = 'proj-1'): Promise<Workspace> {
  const res = await fetch(`${baseUrl}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, name: 'Test WS' }),
  });
  const body = (await res.json()) as ApiResponse<Workspace>;
  if (!body.ok) throw new Error('setup: failed to create workspace');
  return body.data;
}

describe('GET /v1/chat-windows', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns 400 when workspaceId query param is missing', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/chat-windows`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('validation_error');
  });

  it('returns empty list for a workspace with no chat windows', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const res = await fetch(`${harness.baseUrl}/v1/chat-windows?workspaceId=${ws.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ChatWindow[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data).toHaveLength(0);
  });
});

describe('POST /v1/chat-windows', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates a chat window and returns 201', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const res = await fetch(`${harness.baseUrl}/v1/chat-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: ws.id, title: 'Chat 1', provider: 'openai', model: 'gpt-4o' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<ChatWindow>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data.workspaceId).toBe(ws.id);
    expect(body.data.provider).toBe('openai');
    expect(body.data.model).toBe('gpt-4o');
  });

  it('created window id is appended to workspace.windowIds', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const cwRes = await fetch(`${harness.baseUrl}/v1/chat-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: ws.id, title: 'CW', provider: 'anthropic', model: 'claude-3-5-sonnet' }),
    });
    const cwBody = (await cwRes.json()) as ApiResponse<ChatWindow>;
    if (!cwBody.ok) throw new Error('expected ok');
    const cwId = cwBody.data.id;

    const wsListRes = await fetch(`${harness.baseUrl}/v1/workspaces?projectId=proj-1`);
    const wsListBody = (await wsListRes.json()) as ApiResponse<Workspace[]>;
    if (!wsListBody.ok) throw new Error('expected ok');
    const updated = wsListBody.data.find((w) => w.id === ws.id);
    expect(updated?.windowIds).toContain(cwId);
  });

  it('returns 404 when workspaceId does not exist', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/chat-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'nonexistent', title: 'CW', provider: 'openai', model: 'gpt-4o' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
  });

  it('returns 400 for invalid provider', async () => {
    const ws = await createWorkspace(harness.baseUrl);
    const res = await fetch(`${harness.baseUrl}/v1/chat-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: ws.id, title: 'CW', provider: 'unknown', model: 'gpt-4o' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('validation_error');
  });
});
