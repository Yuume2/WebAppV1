import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, Project } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('GET /v1/projects', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns an ok envelope with a typed list of projects', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as ApiResponse<Project[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    for (const p of body.data) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.createdAt).toBe('string');
      expect(typeof p.updatedAt).toBe('string');
      expect(() => new Date(p.createdAt).toISOString()).not.toThrow();
    }
  });

  it('rejects non-GET methods for /v1/projects with 405 envelope', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects`, { method: 'POST' });
    expect(res.status).toBe(405);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('method_not_allowed');
  });
});

describe('GET /v1/projects/:id', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns an ok envelope with the matching project', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects/proj-1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as ApiResponse<Project>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');

    expect(body.data.id).toBe('proj-1');
    expect(typeof body.data.name).toBe('string');
    expect(typeof body.data.createdAt).toBe('string');
    expect(typeof body.data.updatedAt).toBe('string');
  });

  it('returns 404 not_found envelope for an unknown id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('does-not-exist');
  });

  it('decodes URI-encoded ids', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects/${encodeURIComponent('weird id/../x')}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.message).toContain('weird id/../x');
  });

  it('rejects non-GET methods for /v1/projects/:id with 405 envelope', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects/proj-1`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('method_not_allowed');
  });
});
