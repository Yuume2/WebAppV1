import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, HealthStatus } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('GET /health', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns 200 with health envelope and request id header', async () => {
    const res = await fetch(`${harness.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const body = (await res.json()) as ApiResponse<HealthStatus>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');

    expect(body.data.service).toBe('webapp-api');
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.version).toBe('string');
    expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(body.data.timestamp).toISOString()).not.toThrow();
  });

  it('returns 404 for /v1/health — not a registered route', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/health`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('not_found');
  });
});
