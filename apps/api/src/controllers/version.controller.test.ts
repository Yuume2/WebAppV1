import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResponse } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

describe('GET /v1/version', () => {
  let harness: Harness;
  beforeEach(async () => { harness = await startTestServer(); });
  afterEach(async () => { await harness.close(); });

  it('returns service + version + node + buildTimestamp', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/version`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      service: string; version: string; commit: string | null; node: string; buildTimestamp: string;
    }>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.service).toBe('webapp-api');
    expect(typeof body.data.version).toBe('string');
    expect(body.data.version.length).toBeGreaterThan(0);
    expect(typeof body.data.node).toBe('string');
    expect(body.data.node.startsWith('v')).toBe(true);
    expect(typeof body.data.buildTimestamp).toBe('string');
    // commit may be null when no GIT_SHA-style env var is set
    expect(body.data.commit === null || typeof body.data.commit === 'string').toBe(true);
    // /version exposes the deployed service version + commit — useful
    // for ops, but every reason for crawlers to NOT index it (lets a
    // search engine snapshot a stale deployment SHA forever, and lets
    // a probe enumerate what version is in production via cached
    // search results). Pin the anti-indexing header.
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('does not emit Vary: Cookie — version is identical for all viewers', async () => {
    // Pin the absence: if /v1/version ever started carrying Vary: Cookie,
    // a shared cache would fragment by every visitor's cookie state and
    // multiply storage load for a response that never depends on it.
    const res = await fetch(`${harness.baseUrl}/v1/version`);
    const vary = res.headers.get('vary') ?? '';
    if (vary) {
      expect(vary).not.toContain('Cookie');
    }
  });

  it('never emits Set-Cookie on the public version endpoint', async () => {
    const res = await fetch(`${harness.baseUrl}/v1/version`);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
