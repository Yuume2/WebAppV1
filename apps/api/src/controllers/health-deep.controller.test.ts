import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { ApiResponse } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { healthDeepController, type DbStatus, type HealthDeepDeps } from './health-deep.controller.js';

function makeDeps(status: DbStatus, latencyMs: number | null = status === 'disabled' ? null : 7): HealthDeepDeps {
  return { pingDb: async () => ({ status, latencyMs }) };
}

async function startServer(deps: HealthDeepDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.register({ method: 'GET', path: '/v1/health/deep', handler: (ctx) => healthDeepController(ctx, deps) });
  const server: Server = createApiServer(router);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe('GET /v1/health/deep', () => {
  it('returns 200 with db=ok and dbLatencyMs when ping succeeds', async () => {
    const { baseUrl, close } = await startServer(makeDeps('ok', 12));
    const res = await fetch(`${baseUrl}/v1/health/deep`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ db: DbStatus; dbLatencyMs: number | null; service: string }>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.db).toBe('ok');
    expect(body.data.dbLatencyMs).toBe(12);
    expect(body.data.service).toBe('webapp-api');
    await close();
  });

  it('returns 200 with db=disabled and dbLatencyMs=null when no DATABASE_URL', async () => {
    const { baseUrl, close } = await startServer(makeDeps('disabled'));
    const res = await fetch(`${baseUrl}/v1/health/deep`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ db: DbStatus; dbLatencyMs: number | null }>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.db).toBe('disabled');
    expect(body.data.dbLatencyMs).toBeNull();
    await close();
  });

  it('returns 503 with db=down + dbLatencyMs when ping fails', async () => {
    const { baseUrl, close } = await startServer(makeDeps('down', 4_999));
    const res = await fetch(`${baseUrl}/v1/health/deep`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('internal_error');
    const details = body.error.details as { db: DbStatus; dbLatencyMs: number | null };
    expect(details.db).toBe('down');
    expect(details.dbLatencyMs).toBe(4_999);
    // 503 from the deep health probe must NOT be cached. A CDN that
    // briefly cached a 503 would extend the downtime window for every
    // subsequent client. Pin no-store on this path explicitly because
    // health responses are an obvious caching candidate for a misconfigured
    // proxy.
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    await close();
  });

  it('returns 200 with cache-control: no-store on the healthy path too', async () => {
    // Same logic — health checks are a poll target, not a content endpoint.
    // Even the success response must not be cacheable; otherwise a stale
    // 'ok' would mask a real outage to anyone behind the cache.
    const { baseUrl, close } = await startServer(makeDeps('ok'));
    const res = await fetch(`${baseUrl}/v1/health/deep`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    // Mirror of the /health pin — keep the deep probe out of search
    // engine indexes too. Same risk profile (always 200 in healthy
    // state, small predictable JSON body).
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    await close();
  });
});
