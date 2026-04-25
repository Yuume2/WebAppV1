import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ChatWindow, Message, Project, Workspace } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

let harness: Harness;

beforeAll(async () => {
  harness = await startTestServer();
});

afterAll(async () => {
  await harness.close();
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(`setup POST ${path} failed: ${JSON.stringify(json)}`);
  return json.data;
}

// ── GET /v1/projects/:id ─────────────────────────────────────────────────────

describe('GET /v1/projects/:id', () => {
  it('returns the seeded project by id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects/proj-1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Project>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe('proj-1');
    expect(body.data.name).toBe('Research Sprint');
  });

  it('returns 404 for unknown project id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('not_found');
  });

  it('returns a project that was just created', async () => {
    const created = await post<Project>('/v1/projects', { name: 'New P' });
    const res = await fetch(`${harness.baseUrl}/v1/projects/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Project>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe(created.id);
  });
});

// ── GET /v1/workspaces/:id ───────────────────────────────────────────────────

describe('GET /v1/workspaces/:id', () => {
  it('returns a workspace by id', async () => {
    const ws = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'WS GetById' });
    const res = await fetch(`${harness.baseUrl}/v1/workspaces/${ws.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Workspace>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe(ws.id);
    expect(body.data.projectId).toBe('proj-1');
  });

  it('returns 404 for unknown workspace id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('not_found');
  });
});

// ── GET /v1/chat-windows/:id ─────────────────────────────────────────────────

describe('GET /v1/chat-windows/:id', () => {
  it('returns a chat window by id', async () => {
    const ws = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'WS' });
    const cw = await post<ChatWindow>('/v1/chat-windows', {
      workspaceId: ws.id, title: 'CW GetById', provider: 'openai', model: 'gpt-4o',
    });

    const res = await fetch(`${harness.baseUrl}/v1/chat-windows/${cw.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ChatWindow>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe(cw.id);
    expect(body.data.provider).toBe('openai');
  });

  it('returns 404 for unknown chat window id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/chat-windows/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('not_found');
  });
});

// ── GET /v1/messages/:id ─────────────────────────────────────────────────────

describe('GET /v1/messages/:id', () => {
  it('returns a message by id', async () => {
    const ws = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'WS' });
    const cw = await post<ChatWindow>('/v1/chat-windows', {
      workspaceId: ws.id, title: 'CW', provider: 'openai', model: 'gpt-4o',
    });
    const msg = await post<Message>('/v1/messages', {
      chatWindowId: cw.id, role: 'user', content: 'Hello',
    });

    const res = await fetch(`${harness.baseUrl}/v1/messages/${msg.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Message>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe(msg.id);
    expect(body.data.chatWindowId).toBe(cw.id);
    expect(body.data.content).toBe('Hello');
  });

  it('returns 404 for unknown message id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/messages/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('not_found');
  });
});
