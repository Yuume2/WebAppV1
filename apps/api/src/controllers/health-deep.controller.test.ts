import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { ApiResponse } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { healthDeepController, type DbStatus, type HealthDeepDeps } from './health-deep.controller.js';

function makeDeps(status: DbStatus): HealthDeepDeps {
  return { pingDb: async () => status };
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
  it('returns 200 with db=ok when ping succeeds', async () => {
    const { baseUrl, close } = await startServer(makeDeps('ok'));
    const res = await fetch(`${baseUrl}/v1/health/deep`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ db: DbStatus; service: string }>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.db).toBe('ok');
    expect(body.data.service).toBe('webapp-api');
    await close();
  });

  it('returns 200 with db=disabled when no DATABASE_URL', async () => {
    const { baseUrl, close } = await startServer(makeDeps('disabled'));
    const res = await fetch(`${baseUrl}/v1/health/deep`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ db: DbStatus }>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.db).toBe('disabled');
    await close();
  });

  it('returns 503 with db=down when ping fails', async () => {
    const { baseUrl, close } = await startServer(makeDeps('down'));
    const res = await fetch(`${baseUrl}/v1/health/deep`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('internal_error');
    expect((body.error.details as { db: DbStatus }).db).toBe('down');
    await close();
  });
});
