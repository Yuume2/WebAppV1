import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, Workspace } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('GET /v1/workspaces', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns 400 when projectId query param is missing', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('validation_error');
  });

  it('returns empty list for a project with no workspaces', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces?projectId=proj-1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Workspace[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('POST /v1/workspaces', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates a workspace and returns 201', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1', name: 'WS One' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<Workspace>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(typeof body.data.id).toBe('string');
    expect(body.data.projectId).toBe('proj-1');
    expect(body.data.name).toBe('WS One');
    expect(Array.isArray(body.data.windowIds)).toBe(true);
    expect(body.data.windowIds).toHaveLength(0);
    expect(res.headers.get('location')).toBe(`/v1/workspaces/${body.data.id}`);
  });

  it('created workspace is then visible via GET with filter', async () => {
    await fetch(`${harness.baseUrl}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-2', name: 'WS Two' }),
    });

    const res = await fetch(`${harness.baseUrl}/v1/workspaces?projectId=proj-2`);
    const body = (await res.json()) as ApiResponse<Workspace[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data.some((w) => w.name === 'WS Two')).toBe(true);
    expect(body.data.every((w) => w.projectId === 'proj-2')).toBe(true);
  });

  it('returns 404 when projectId does not exist', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'nonexistent', name: 'WS' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
  });

  it('returns 400 when name is missing', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('validation_error');
  });
});
