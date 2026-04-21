import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, AppState } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { stateDbController } from '../controllers/state-db.controller.js';
import type { StateDeps } from '../controllers/state-db.controller.js';
import { API_STATE_PATH } from '@webapp/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_1 = { id: 'user-1', email: 'alice@example.com' };

const EMPTY_STATE: AppState = { projects: [], workspaces: [], chatWindows: [], messages: [] };

const SEEDED_STATE: AppState = {
  projects: [{ id: 'p1', name: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  workspaces: [{ id: 'w1', projectId: 'p1', name: 'WS', windowIds: ['cw1'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  chatWindows: [{ id: 'cw1', workspaceId: 'w1', title: 'Chat', provider: 'openai', model: 'gpt-4o', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  messages: [{ id: 'm1', chatWindowId: 'cw1', role: 'user', content: 'Hello', createdAt: '2026-01-01T00:00:00.000Z' }],
};

function makeDeps(overrides: Partial<StateDeps> = {}): StateDeps {
  return {
    resolveUser: async () => null,
    loadState:   async () => EMPTY_STATE,
    ...overrides,
  };
}

async function startServer(deps: StateDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll([{
    method: 'GET',
    path: API_STATE_PATH,
    handler: (ctx) => stateDbController(ctx, deps),
  }]);
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /v1/state — DB-backed mode', () => {
  let s: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => { s = await startServer(makeDeps()); });
  afterAll(async () => { await s.close(); });

  it('returns 401 when unauthenticated', async () => {
    const res = await fetch(`${s.baseUrl}/v1/state`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
  });
});

describe('GET /v1/state — authenticated returns user graph', () => {
  it('returns empty collections when user has no data', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser: async () => USER_1,
      loadState:   async () => EMPTY_STATE,
    }));
    const res = await fetch(`${baseUrl}/v1/state`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<AppState>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.projects).toHaveLength(0);
    expect(body.data.workspaces).toHaveLength(0);
    expect(body.data.chatWindows).toHaveLength(0);
    expect(body.data.messages).toHaveLength(0);
    await close();
  });

  it('returns only the authenticated user\'s full entity graph', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser: async () => USER_1,
      loadState:   async (userId) => userId === USER_1.id ? SEEDED_STATE : EMPTY_STATE,
    }));
    const res = await fetch(`${baseUrl}/v1/state`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<AppState>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.workspaces).toHaveLength(1);
    expect(body.data.chatWindows).toHaveLength(1);
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.projects[0]!.id).toBe('p1');
    expect(body.data.workspaces[0]!.windowIds).toEqual(['cw1']);
    await close();
  });
});
