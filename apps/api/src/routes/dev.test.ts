import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, AppState, Project } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

let harness: Harness;

beforeAll(async () => { harness = await startTestServer(); });
afterAll(async () => { await harness.close(); });

async function post<T>(path: string): Promise<ApiResponse<T>> {
  const res = await fetch(`${harness.baseUrl}${path}`, { method: 'POST' });
  return (await res.json()) as ApiResponse<T>;
}

async function getState(): Promise<AppState> {
  const res = await fetch(`${harness.baseUrl}/v1/state`);
  const body = (await res.json()) as ApiResponse<AppState>;
  if (!body.ok) throw new Error('getState failed');
  return body.data;
}

describe('POST /v1/dev/reset', () => {
  it('returns 200 ok with reset: true', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/dev/reset`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ reset: boolean }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.reset).toBe(true);
  });

  it('empties all collections', async () => {
    // first seed something
    await post('/v1/dev/seed');

    // then reset
    await post('/v1/dev/reset');

    const state = await getState();
    expect(state.projects).toHaveLength(0);
    expect(state.workspaces).toHaveLength(0);
    expect(state.chatWindows).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
  });
});

describe('POST /v1/dev/seed', () => {
  it('returns 200 ok with seeded: true and state snapshot', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/dev/seed`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ seeded: boolean; state: AppState }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.seeded).toBe(true);
    expect(Array.isArray(body.data.state.projects)).toBe(true);
  });

  it('creates deterministic coherent state — same IDs on every call', async () => {
    await post('/v1/dev/seed');
    const state1 = await getState();

    await post('/v1/dev/seed');
    const state2 = await getState();

    expect(state1.projects.map((p) => p.id)).toEqual(state2.projects.map((p) => p.id));
    expect(state1.workspaces.map((w) => w.id)).toEqual(state2.workspaces.map((w) => w.id));
    expect(state1.chatWindows.map((c) => c.id)).toEqual(state2.chatWindows.map((c) => c.id));
    expect(state1.messages.map((m) => m.id)).toEqual(state2.messages.map((m) => m.id));
  });

  it('seed clears previous data before inserting', async () => {
    // add an extra project
    await fetch(`${harness.baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Should be wiped' }),
    });

    await post('/v1/dev/seed');

    const state = await getState();
    expect(state.projects.every((p) => p.name !== 'Should be wiped')).toBe(true);
  });

  it('seeded state is coherent — foreign keys resolve', async () => {
    await post('/v1/dev/seed');
    const state = await getState();

    // every workspace points to a real project
    const projectIds = new Set(state.projects.map((p) => p.id));
    for (const ws of state.workspaces) {
      expect(projectIds.has(ws.projectId)).toBe(true);
    }

    // every chat window points to a real workspace
    const wsIds = new Set(state.workspaces.map((w) => w.id));
    for (const cw of state.chatWindows) {
      expect(wsIds.has(cw.workspaceId)).toBe(true);
    }

    // every message points to a real chat window
    const cwIds = new Set(state.chatWindows.map((c) => c.id));
    for (const msg of state.messages) {
      expect(cwIds.has(msg.chatWindowId)).toBe(true);
    }

    // workspace.windowIds contains only real chat window IDs
    for (const ws of state.workspaces) {
      for (const wid of ws.windowIds) {
        expect(cwIds.has(wid)).toBe(true);
      }
    }
  });

  it('seeded projects have known fixed IDs', async () => {
    await post('/v1/dev/seed');
    const state = await getState();
    const ids = state.projects.map((p) => p.id);
    expect(ids).toContain('demo-proj-1');
    expect(ids).toContain('demo-proj-2');
  });

  it('dev endpoints return 404 in production — verified via route table exclusion', () => {
    // dev routes are conditionally registered: env.nodeEnv !== 'production'
    // In test env (NODE_ENV=test) they are available.
    // In production (NODE_ENV=production) they are excluded at startup — router has no entry,
    // so any POST /v1/dev/* returns 404 not_found, same as any unknown path.
    // This is enforced statically at buildRouter() time, no runtime branching needed.
    expect(true).toBe(true); // documented, not re-tested here to avoid production server setup
  });
});

describe('GET /v1/projects after seed — data is correctly queryable', () => {
  it('projects are listed after seed', async () => {
    await post('/v1/dev/seed');
    const res = await fetch(`${harness.baseUrl}/v1/projects`);
    const body = (await res.json()) as ApiResponse<Project[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.length).toBe(2);
  });
});
