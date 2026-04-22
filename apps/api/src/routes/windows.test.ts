import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ChatWindow } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('GET /v1/workspaces/:id/windows', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns the windows belonging to the workspace', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces/ws-1/windows`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as ApiResponse<ChatWindow[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    for (const w of body.data) {
      expect(w.workspaceId).toBe('ws-1');
      expect(typeof w.id).toBe('string');
      expect(typeof w.title).toBe('string');
      expect(['openai', 'anthropic', 'perplexity']).toContain(w.provider);
      expect(typeof w.model).toBe('string');
      expect(typeof w.createdAt).toBe('string');
      expect(typeof w.updatedAt).toBe('string');
    }
  });

  it('returns 404 not_found for an unknown workspace id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces/does-not-exist/windows`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('does-not-exist');
  });

  it('rejects non-GET methods with 405 envelope', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/workspaces/ws-1/windows`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('method_not_allowed');
  });
});
