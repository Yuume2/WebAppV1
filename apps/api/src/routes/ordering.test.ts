import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ChatWindow, Message, Project, Workspace } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

let harness: Harness;

beforeAll(async () => { harness = await startTestServer(); });
afterAll(async () => { await harness.close(); });

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(`POST ${path} failed`);
  return json.data;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${harness.baseUrl}${path}`);
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(`GET ${path} failed`);
  return json.data;
}

describe('list ordering — createdAt ASC, id ASC tie-breaker', () => {
  it('GET /v1/projects — seeded projects sorted by id (same createdAt)', async () => {
    const projects = await get<Project[]>('/v1/projects');
    // proj-1 and proj-2 share the same seeded createdAt, so id tie-breaker applies
    const idx1 = projects.findIndex((p) => p.id === 'proj-1');
    const idx2 = projects.findIndex((p) => p.id === 'proj-2');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
  });

  it('GET /v1/projects — newly created projects appear after seeded ones', async () => {
    const created = await post<Project>('/v1/projects', { name: 'Ordering Test' });
    const projects = await get<Project[]>('/v1/projects');
    const seededIdx = projects.findIndex((p) => p.id === 'proj-1');
    const newIdx = projects.findIndex((p) => p.id === created.id);
    expect(seededIdx).toBeLessThan(newIdx);
  });

  it('GET /v1/workspaces — multiple workspaces returned in createdAt/id order', async () => {
    const ws1 = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'Alpha' });
    const ws2 = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'Beta' });
    const list = await get<Workspace[]>('/v1/workspaces?projectId=proj-1');
    const i1 = list.findIndex((w) => w.id === ws1.id);
    const i2 = list.findIndex((w) => w.id === ws2.id);
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    // ws1 created before ws2; if same ms, id tie-breaker still gives stable result
    expect(i1).toBeLessThanOrEqual(i2);
  });

  it('GET /v1/chat-windows — multiple windows returned in createdAt/id order', async () => {
    const ws = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'WS' });
    const cw1 = await post<ChatWindow>('/v1/chat-windows', { workspaceId: ws.id, title: 'CW-A', provider: 'openai', model: 'gpt-4o' });
    const cw2 = await post<ChatWindow>('/v1/chat-windows', { workspaceId: ws.id, title: 'CW-B', provider: 'anthropic', model: 'claude-3-5-sonnet' });
    const list = await get<ChatWindow[]>(`/v1/chat-windows?workspaceId=${ws.id}`);
    const i1 = list.findIndex((c) => c.id === cw1.id);
    const i2 = list.findIndex((c) => c.id === cw2.id);
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i1).toBeLessThanOrEqual(i2);
  });

  it('GET /v1/messages — messages returned in createdAt/id order', async () => {
    const ws = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'WS' });
    const cw = await post<ChatWindow>('/v1/chat-windows', { workspaceId: ws.id, title: 'CW', provider: 'openai', model: 'gpt-4o' });
    const m1 = await post<Message>('/v1/messages', { chatWindowId: cw.id, role: 'user', content: 'first' });
    const m2 = await post<Message>('/v1/messages', { chatWindowId: cw.id, role: 'assistant', content: 'second' });
    const list = await get<Message[]>(`/v1/messages?chatWindowId=${cw.id}`);
    const i1 = list.findIndex((m) => m.id === m1.id);
    const i2 = list.findIndex((m) => m.id === m2.id);
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i1).toBeLessThanOrEqual(i2);
  });

  it('GET /v1/state — all collections follow the same order guarantee', async () => {
    const state = await get<{
      projects: Project[];
      workspaces: Workspace[];
      chatWindows: ChatWindow[];
      messages: Message[];
    }>('/v1/state');

    // projects: proj-1 before proj-2 (same createdAt, id tie-breaker)
    const pi1 = state.projects.findIndex((p) => p.id === 'proj-1');
    const pi2 = state.projects.findIndex((p) => p.id === 'proj-2');
    expect(pi1).toBeLessThan(pi2);

    // each collection is non-decreasing by createdAt
    for (const items of [state.projects, state.workspaces, state.chatWindows, state.messages]) {
      for (let i = 1; i < items.length; i++) {
        expect(items[i].createdAt >= items[i - 1].createdAt).toBe(true);
      }
    }
  });
});
