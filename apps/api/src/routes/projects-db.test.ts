import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, Project } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeProjectDbRoutes } from './projects-db.js';
import type { ProjectsDeps } from '../controllers/projects-db.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_1 = { id: 'user-1', email: 'alice@example.com' };
const USER_2 = { id: 'user-2', email: 'bob@example.com' };

function mockProject(userId: string, overrides: Partial<{
  id: string; name: string; description: string | null; createdAt: Date; updatedAt: Date;
}> = {}) {
  return {
    id: 'proj-1',
    userId,
    name: 'My Project',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ProjectsDeps> = {}): ProjectsDeps {
  return {
    resolveUser:   async () => null,
    listProjects:  async () => [],
    createProject: async (userId, name, description) => mockProject(userId, { name, description: description ?? null }),
    findProject:   async () => null,
    ...overrides,
  };
}

async function startServer(deps: ProjectsDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll(makeProjectDbRoutes(deps));
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

describe('project routes — unauthenticated', () => {
  let s: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => { s = await startServer(makeDeps()); });
  afterAll(async () => { await s.close(); });

  it('GET /v1/projects returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/projects');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
  });

  it('POST /v1/projects returns 401', async () => {
    const res = await post(s.baseUrl, '/v1/projects', { name: 'X' });
    expect(res.status).toBe(401);
  });

  it('GET /v1/projects/:id returns 401', async () => {
    const res = await get(s.baseUrl, '/v1/projects/some-id');
    expect(res.status).toBe(401);
  });
});

// ── Authenticated list ────────────────────────────────────────────────────────

describe('GET /v1/projects — authenticated', () => {
  it('returns only the authenticated user\'s projects', async () => {
    const userProjects = [
      mockProject(USER_1.id, { id: 'p1', name: 'Alpha' }),
      mockProject(USER_1.id, { id: 'p2', name: 'Beta' }),
    ];

    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:  async () => USER_1,
      listProjects: async (userId) => userId === USER_1.id ? userProjects : [],
    }));

    const res = await get(baseUrl, '/v1/projects');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Project[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(2);
    expect(body.data.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(body.data.every((p) => !('userId' in p))).toBe(true);
    await close();
  });

  it('returns empty array when user has no projects', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser: async () => USER_1,
      listProjects: async () => [],
    }));
    const res = await get(baseUrl, '/v1/projects');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Project[]>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data).toHaveLength(0);
    await close();
  });
});

// ── Authenticated create ──────────────────────────────────────────────────────

describe('POST /v1/projects — authenticated', () => {
  it('creates project, returns 201 with location header', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser: async () => USER_1,
    }));
    const res = await post(baseUrl, '/v1/projects', { name: 'New Project', description: 'desc' });
    expect(res.status).toBe(201);

    const body = (await res.json()) as ApiResponse<Project>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.name).toBe('New Project');
    expect('userId' in body.data).toBe(false);
    expect(res.headers.get('location')).toMatch(/\/v1\/projects\//);
    await close();
  });

  it('returns 400 invalid_body when name is missing', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await post(baseUrl, '/v1/projects', { description: 'no name' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('invalid_body');
    await close();
  });
});

// ── Project by id — cross-user isolation ─────────────────────────────────────

describe('GET /v1/projects/:id — user isolation', () => {
  it('returns own project', async () => {
    const proj = mockProject(USER_1.id, { id: 'own-proj' });
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:  async () => USER_1,
      findProject: async (id, userId) => (id === 'own-proj' && userId === USER_1.id) ? proj : null,
    }));
    const res = await get(baseUrl, '/v1/projects/own-proj');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Project>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe('own-proj');
    await close();
  });

  it('returns 404 for another user\'s project (does not reveal existence)', async () => {
    // user-2's project; user-1 is authenticated
    const { baseUrl, close } = await startServer(makeDeps({
      resolveUser:  async () => USER_1,
      findProject: async (_id, userId) => userId === USER_2.id ? mockProject(USER_2.id) : null,
    }));
    const res = await get(baseUrl, '/v1/projects/user2-proj');
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 404 for non-existent project', async () => {
    const { baseUrl, close } = await startServer(makeDeps({ resolveUser: async () => USER_1 }));
    const res = await get(baseUrl, '/v1/projects/does-not-exist');
    expect(res.status).toBe(404);
    await close();
  });
});
