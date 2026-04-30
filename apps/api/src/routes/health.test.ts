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
    // Health endpoints are the most common target for misrouted Googlebot
    // hits — they're indexed without effort because they always 200 and
    // return a small JSON body. Pin X-Robots-Tag explicitly so this stays
    // out of search results regardless of any future caching/CDN tweak.
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    const body = (await res.json()) as ApiResponse<HealthStatus>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');

    expect(body.data.service).toBe('webapp-api');
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.version).toBe('string');
    expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(body.data.timestamp).toISOString()).not.toThrow();
  });

  it('also serves /v1/health with the same envelope', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<HealthStatus>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok envelope');
    expect(body.data.service).toBe('webapp-api');
    expect(body.data.status).toBe('ok');
  });

  it('never emits Set-Cookie on the public health endpoint', async () => {
    // /health is a public, anonymous probe target. Any Set-Cookie here
    // would either leak a session into a poller or accidentally pin a
    // cookie on a probe origin. Mirror of the /v1/version Set-Cookie
    // absence pin — both endpoints share the same threat profile.
    const res = await fetch(`${harness.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('does not emit Vary: Cookie on /health (not user-scoped)', async () => {
    // /health is identical for all viewers. Vary: Cookie would fragment
    // shared caches by every visitor's cookie state for a response that
    // never depends on it. Mirror of the /v1/health/deep + /v1/version
    // Vary absence pins.
    const res = await fetch(`${harness.baseUrl}/health`);
    const vary = res.headers.get('vary') ?? '';
    if (vary) {
      expect(vary).not.toContain('Cookie');
    }
  });

  it('does not emit Vary: Cookie on /v1/health (alias also non-user-scoped)', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/health`);
    const vary = res.headers.get('vary') ?? '';
    if (vary) {
      expect(vary).not.toContain('Cookie');
    }
  });

  it('never emits Set-Cookie on /v1/health alias', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
