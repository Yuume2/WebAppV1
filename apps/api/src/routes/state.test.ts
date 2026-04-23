import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('GET /v1/state', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns an ok envelope with all four collections', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/state`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as ApiResponse<{
      projects: unknown[];
      workspaces: unknown[];
      chatWindows: unknown[];
      messages: unknown[];
    }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');

    expect(Array.isArray(body.data.projects)).toBe(true);
    expect(Array.isArray(body.data.workspaces)).toBe(true);
    expect(Array.isArray(body.data.chatWindows)).toBe(true);
    expect(Array.isArray(body.data.messages)).toBe(true);

    // seeded projects are always present
    expect(body.data.projects.length).toBeGreaterThanOrEqual(2);
  });

  it('reflects created resources', async () => {
    // create a full chain
    await fetch(`${harness.baseUrl}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1', name: 'State WS' }),
    });

    const res = await fetch(`${harness.baseUrl}/v1/state`);
    const body = (await res.json()) as ApiResponse<{ workspaces: unknown[] }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data.workspaces.length).toBeGreaterThanOrEqual(1);
  });
});
