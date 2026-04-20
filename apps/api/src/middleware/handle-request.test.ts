import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('dispatch — error envelopes', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns 404 not_found envelope for unknown paths', async () => {
    const res = await fetch(`${harness.baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
  });

  it('returns 405 with Allow header on exact route', async () => {
    const res = await fetch(`${harness.baseUrl}/health`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');

    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('method_not_allowed');
  });

  it('returns 405 with Allow header on collection route (GET, POST)', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    const allow = res.headers.get('allow') ?? '';
    expect(allow).toContain('GET');
    expect(allow).toContain('POST');
  });

  it('returns 405 with Allow header on :id pattern route (GET only)', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/projects/some-id`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');

    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('method_not_allowed');
  });

  it('unknown path still returns 404 without Allow header', async () => {
    const res = await fetch(`${harness.baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('allow')).toBeNull();

    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
  });
});
