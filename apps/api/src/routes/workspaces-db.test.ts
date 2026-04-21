import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, Workspace } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeWorkspaceDbRoutes } from './workspaces-db.js';
import type { WorkspacesDeps } from '../controllers/workspaces-db.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_1 = { id: 'user-1', email: 'alice@example.com' };
const USER_2 = { id: 'user-2', email: 'bob@example.com' };

function mockWorkspace(projectId: string, overrides: Partial<{
  id: string; name: string; createdAt: Date; updatedAt: Date;
}> = {}) {
  return {
    id: 'ws-1',
    projectId,
    name: 'My Workspace',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<WorkspacesDeps> = {}): WorkspacesDeps {
  return {
    resolveUser:     async () => null,
    listWorkspaces:  async () => null,
    createWorkspace: async (projectId, _userId, name) => mockWorkspace(projectId, { name }),
    findWorkspace:   async () => null,
    ...overrides,
  };
}

async function startServer(deps: WorkspacesDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll(makeWorkspaceDbRoutes(deps));
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

describe('workspace routes — unauthenticated', () => {
  let s: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => { s = await startServer(makeDeps()); });
  afterAll(async () => { await s.close(); });

  it('GET /v1/workspaces returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/workspaces?projectId=proj-1');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
  });

  it('POST /v1/workspaces returns 401', async () => {
    const res = await post(s.baseUrl, '/v1/workspaces', { projectId: 'proj-1', name: 'X' });
    expect(res.status).toBe(401);
  });

  it('GET /v1/workspaces/:id returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/workspaces/some-id');
    expect(res.status).toBe(401);
  });
});

// ── List workspaces ───────────────────────────────────────────────────────────

describe('GET /v1/workspaces — authenticated', () => {
  it('returns 400 when projectId query param is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/workspaces');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    await close();
  });

  it('returns 404 when project is not owned by user', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      listWorkspaces: async () => null,
    }));
    const res = await get(baseUrl, '/v1/workspaces?projectId=other-proj');
    expect(res.status).toBe(404);
    await close();
  });

  it("returns user's workspaces for their project", async () => {
    const ws = [
      mockWorkspace('proj-1', { id: 'ws-1', name: 'Alpha' }),
      mockWorkspace('proj-1', { id: 'ws-2', name: 'Beta' }),
    ];
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:    async () => USER_1,
      listWorkspaces: async (projectId, userId) =>
        projectId === 'proj-1' && userId === USER_1.id ? ws : null,
    }));
    const res = await get(baseUrl, '/v1/workspaces?projectId=proj-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Workspace[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(2);
    expect(body.data.map((w) => w.id)).toEqual(['ws-1', 'ws-2']);
    expect(body.data.every((w) => Array.isArray(w.windowIds))).toBe(true);
    await close();
  });
});

// ── Create workspace ──────────────────────────────────────────────────────────

describe('POST /v1/workspaces — authenticated', () => {
  it('creates workspace, returns 201 with location header', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      createWorkspace: async (projectId, _userId, name) => mockWorkspace(projectId, { id: 'new-ws', name }),
    }));
    const res = await post(baseUrl, '/v1/workspaces', { projectId: 'proj-1', name: 'New Workspace' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<Workspace>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.name).toBe('New Workspace');
    expect(res.headers.get('location')).toMatch(/\/v1\/workspaces\//);
    await close();
  });

  it('returns 400 when name is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await post(baseUrl, '/v1/workspaces', { projectId: 'proj-1' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('validation_error');
    await close();
  });

  it('returns 400 when projectId is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await post(baseUrl, '/v1/workspaces', { name: 'X' });
    expect(res.status).toBe(400);
    await close();
  });

  it('returns 404 when project is not owned by user', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:     async () => USER_1,
      createWorkspace: async () => null,
    }));
    const res = await post(baseUrl, '/v1/workspaces', { projectId: 'other-proj', name: 'X' });
    expect(res.status).toBe(404);
    await close();
  });
});

// ── Get workspace by id ───────────────────────────────────────────────────────

describe('GET /v1/workspaces/:id — user isolation', () => {
  it('returns own workspace', async () => {
    const ws = mockWorkspace('proj-1', { id: 'own-ws' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:   async () => USER_1,
      findWorkspace: async (id, userId) => (id === 'own-ws' && userId === USER_1.id) ? ws : null,
    }));
    const res = await get(baseUrl, '/v1/workspaces/own-ws');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Workspace>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe('own-ws');
    await close();
  });

  it("returns 404 for another user's workspace (does not reveal existence)", async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:   async () => USER_1,
      findWorkspace: async (_id, userId) => userId === USER_2.id ? mockWorkspace('proj-2') : null,
    }));
    const res = await get(baseUrl, '/v1/workspaces/user2-ws');
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 404 for non-existent workspace', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/workspaces/does-not-exist');
    expect(res.status).toBe(404);
    await close();
  });
});
