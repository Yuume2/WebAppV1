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

  it('emits hardening headers (cross-domain-policies, dns-prefetch-control, robots-tag)', async () => {
    const res = await fetch(`${harness.baseUrl}/health`);
    expect(res.headers.get('x-permitted-cross-domain-policies')).toBe('none');
    expect(res.headers.get('x-dns-prefetch-control')).toBe('off');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('hardening headers ride 404 responses too', async () => {
    const res = await fetch(`${harness.baseUrl}/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-permitted-cross-domain-policies')).toBe('none');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('emits security headers even on a 404 envelope', async () => {
    const res = await fetch(`${harness.baseUrl}/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('emits X-Request-Id on a 200 response', async () => {
    const res = await fetch(`${harness.baseUrl}/health`);
    const id = res.headers.get('x-request-id');
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id!.length).toBeGreaterThan(8);
  });

  it('emits X-Request-Id on a 405 method-not-allowed', async () => {
    const res = await fetch(`${harness.baseUrl}/health`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('every response gets a fresh X-Request-Id', async () => {
    const a = await fetch(`${harness.baseUrl}/health`);
    const b = await fetch(`${harness.baseUrl}/health`);
    expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'));
  });

  it('emits Cache-Control: no-store on JSON responses', async () => {
    const ok = await fetch(`${harness.baseUrl}/health`);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const notFound = await fetch(`${harness.baseUrl}/nope`);
    expect(notFound.headers.get('cache-control')).toBe('no-store');
  });

  it('emits Cache-Control: no-store on 405 method-not-allowed', async () => {
    // A cached 405 would falsely report 'method not allowed' even after
    // a deploy that added the missing handler. Pin the no-store on the
    // handleRequest 405 short-circuit (which uses writeJson under the
    // hood, but a future direct res.writeHead(405) refactor could skip
    // it).
    const res = await fetch(`${harness.baseUrl}/health`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('emits Allow header on 405 listing the methods the path actually supports', async () => {
    // /health is a GET-only route; a DELETE must surface Allow: GET (RFC 7231).
    const res = await fetch(`${harness.baseUrl}/health`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    const allow = res.headers.get('allow') ?? '';
    expect(allow).toContain('GET');
  });

  it('rejects non-canonical HTTP methods with 405 method_not_allowed', async () => {
    // The router only supports the seven methods declared in the HttpMethod
    // type union. A method like LINK / UNLINK / PROPFIND must short-circuit
    // before route matching with a 405, not silently fall through to a 404
    // or worse, get past CSRF and reach a handler. We use a raw socket here
    // because undici's fetch refuses some non-canonical methods at the
    // client layer; we want to exercise the server's own check.
    const url = new URL(harness.baseUrl);
    const port = Number(url.port);
    const { request } = await import('node:http');
    const status: number = await new Promise((resolve, reject) => {
      const r = request(
        { host: url.hostname, port, path: '/health', method: 'PROPFIND' },
        (res) => { res.resume(); resolve(res.statusCode ?? 0); },
      );
      r.on('error', reject);
      r.end();
    });
    expect(status).toBe(405);
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
    // Defensive headers must still ride 403s — they're set before any short-circuit.
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('no-store');
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

// ── 500 internal_error envelope ───────────────────────────────────────────────

async function startWithThrowingHandler(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.register({
    method: 'GET',
    path: '/boom',
    handler: () => { throw new Error('synthetic handler crash'); },
  });
  const server: Server = createApiServer(router);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
  };
}

describe('dispatch — handler crash 500 envelope', () => {
  it('returns 500 internal_error envelope when a handler throws', async () => {
    const { baseUrl, close } = await startWithThrowingHandler();
    const res = await fetch(`${baseUrl}/boom`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as ApiResponse<unknown>;
    if (body.ok) throw new Error('expected error envelope');
    expect(body.error.code).toBe('internal_error');
    // The raw thrown message must NOT leak — the catch handler ships a generic
    // string while the real error is sent to Sentry / logs.
    expect(body.error.message).not.toContain('synthetic handler crash');
    await close();
  });

  it('still emits X-Request-Id, security headers and Cache-Control: no-store on a 500', async () => {
    const { baseUrl, close } = await startWithThrowingHandler();
    const res = await fetch(`${baseUrl}/boom`);
    expect(res.status).toBe(500);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    await close();
  });
});
