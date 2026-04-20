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
});

describe('POST /v1/projects', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates a project and returns 201 with the new project', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Project', description: 'Test' }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as ApiResponse<Project>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(typeof body.data.id).toBe('string');
    expect(body.data.name).toBe('My Project');
    expect(body.data.description).toBe('Test');
  });

  it('creates a project without optional description', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Desc' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<Project>;
    expect(body.ok).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'no name' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('validation_error');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('invalid_json');
  });
});
