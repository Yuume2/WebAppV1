import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';
import { createApiServer } from '../lib/server.js';
import { Router } from '../lib/router.js';
import { routes } from '../routes/index.js';

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

  it('returns 405 method_not_allowed envelope when path exists but method does not', async () => {
    const res = await fetch(`${harness.baseUrl}/health`, { method: 'DELETE' });
    expect(res.status).toBe(405);

    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('method_not_allowed');
  });

  it('emits defensive security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) on every response', async () => {
    const res = await fetch(`${harness.baseUrl}/health`);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('emits security headers even on a 404 envelope', async () => {
    const res = await fetch(`${harness.baseUrl}/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

// ── CSRF protection ───────────────────────────────────────────────────────────

async function startWithOrigin(corsOrigin: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll(routes);
  const server: Server = createApiServer(router, corsOrigin);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
  };
}

describe('CSRF protection — explicit origin', () => {
  const ORIGIN = 'http://localhost:3000';

  it('blocks POST with no Origin/Referer header (403 csrf_error)', async () => {
    const { baseUrl, close } = await startWithOrigin(ORIGIN);
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('csrf_error');
    await close();
  });

  it('blocks POST with mismatched Origin (403)', async () => {
    const { baseUrl, close } = await startWithOrigin(ORIGIN);
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://attacker.example.com' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(403);
    await close();
  });

  it('allows POST with matching Origin (passes CSRF; auth/validation may then 4xx)', async () => {
    const { baseUrl, close } = await startWithOrigin(ORIGIN);
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
      body: JSON.stringify({ name: 'X' }),
    });
    // Not 403 — CSRF passed. The downstream layer can still answer 200/201/401/etc.
    expect(res.status).not.toBe(403);
    await close();
  });

  it('allows GET regardless of Origin/Referer (safe method)', async () => {
    const { baseUrl, close } = await startWithOrigin(ORIGIN);
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    await close();
  });
});

describe('CSRF protection — wildcard origin (dev)', () => {
  it('does not enforce CSRF when CORS_ORIGIN is "*"', async () => {
    const { baseUrl, close } = await startWithOrigin('*');
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).not.toBe(403);
    await close();
  });
});
