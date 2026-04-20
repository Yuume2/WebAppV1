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

function assertSorted(items: Array<{ createdAt: string; id: string }>): void {
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1];
    const b = items[i];
    const cmp = a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    expect(cmp, `item[${i - 1}] should come before item[${i}]`).toBeLessThanOrEqual(0);
  }
}

describe('list ordering — createdAt ASC, id ASC tie-breaker', () => {
  it('GET /v1/projects — seeded projects sorted by id (same createdAt)', async () => {
    const projects = await get<Project[]>('/v1/projects');
    // proj-1 and proj-2 share the same seeded createdAt; id tie-breaker: 'proj-1' < 'proj-2'
    const idx1 = projects.findIndex((p) => p.id === 'proj-1');
    const idx2 = projects.findIndex((p) => p.id === 'proj-2');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
    assertSorted(projects);
  });

  it('GET /v1/projects — newly created project (later timestamp) appears after seeded ones', async () => {
    const created = await post<Project>('/v1/projects', { name: 'Ordering Test' });
    const projects = await get<Project[]>('/v1/projects');
    const seededIdx = projects.findIndex((p) => p.id === 'proj-1');
    const newIdx = projects.findIndex((p) => p.id === created.id);
    // seeded createdAt is 2026-04-18; new item is created at current time which is after
    expect(seededIdx).toBeLessThan(newIdx);
    assertSorted(projects);
  });

  it('GET /v1/workspaces — list is sorted by createdAt/id', async () => {
    await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'Alpha' });
    await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'Beta' });
    const list = await get<Workspace[]>('/v1/workspaces?projectId=proj-1');
    expect(list.length).toBeGreaterThanOrEqual(2);
    assertSorted(list);
  });

  it('GET /v1/chat-windows — list is sorted by createdAt/id', async () => {
    const ws = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'WS' });
    await post<ChatWindow>('/v1/chat-windows', { workspaceId: ws.id, title: 'CW-A', provider: 'openai', model: 'gpt-4o' });
    await post<ChatWindow>('/v1/chat-windows', { workspaceId: ws.id, title: 'CW-B', provider: 'anthropic', model: 'claude-3-5-sonnet' });
    const list = await get<ChatWindow[]>(`/v1/chat-windows?workspaceId=${ws.id}`);
    expect(list.length).toBeGreaterThanOrEqual(2);
    assertSorted(list);
  });

  it('GET /v1/messages — list is sorted by createdAt/id', async () => {
    const ws = await post<Workspace>('/v1/workspaces', { projectId: 'proj-1', name: 'WS' });
    const cw = await post<ChatWindow>('/v1/chat-windows', { workspaceId: ws.id, title: 'CW', provider: 'openai', model: 'gpt-4o' });
    await post<Message>('/v1/messages', { chatWindowId: cw.id, role: 'user', content: 'first' });
    await post<Message>('/v1/messages', { chatWindowId: cw.id, role: 'assistant', content: 'second' });
    const list = await get<Message[]>(`/v1/messages?chatWindowId=${cw.id}`);
    expect(list.length).toBeGreaterThanOrEqual(2);
    assertSorted(list);
  });

  it('GET /v1/state — all collections are sorted by createdAt/id', async () => {
    const state = await get<{
      projects: Project[];
      workspaces: Workspace[];
      chatWindows: ChatWindow[];
      messages: Message[];
    }>('/v1/state');

    // seeded projects: proj-1 before proj-2 (same createdAt, id tie-breaker)
    const pi1 = state.projects.findIndex((p) => p.id === 'proj-1');
    const pi2 = state.projects.findIndex((p) => p.id === 'proj-2');
    expect(pi1).toBeLessThan(pi2);

    assertSorted(state.projects);
    assertSorted(state.workspaces);
    assertSorted(state.chatWindows);
    assertSorted(state.messages);
  });
});
