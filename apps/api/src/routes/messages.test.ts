import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, Message } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('GET /v1/windows/:id/messages', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns the messages belonging to the window', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/windows/win-1/messages`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as ApiResponse<Message[]>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    for (const m of body.data) {
      expect(m.windowId).toBe('win-1');
      expect(typeof m.id).toBe('string');
      expect(['user', 'assistant']).toContain(m.role);
      expect(typeof m.content).toBe('string');
      expect(typeof m.createdAt).toBe('string');
    }
  });

  it('returns 404 not_found for an unknown window id', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/windows/does-not-exist/messages`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('does-not-exist');
  });

  it('rejects non-GET methods with 405 envelope', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/windows/win-1/messages`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('method_not_allowed');
  });
});
