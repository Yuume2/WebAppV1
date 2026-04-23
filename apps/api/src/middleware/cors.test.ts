import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_PROJECTS_PATH, API_HEALTH_PATH } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';
import { buildRouter, createApiServer } from '../lib/server.js';

async function startServerWithOrigin(corsOrigin: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createApiServer(buildRouter(), corsOrigin);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
  };
}

describe('CORS headers', () => {
  let harness: Harness;

  beforeAll(async () => { harness = await startTestServer(); });
  afterAll(async () => { await harness.close(); });

  it('GET response includes Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('POST response includes Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${harness.baseUrl}${API_PROJECTS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CORS test' }),
    });
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('error response includes Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${harness.baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('ACAO header is the configured static origin, not an echo of the request Origin', async () => {
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`, {
      headers: { Origin: 'http://attacker.example.com' },
    });
    const acao = res.headers.get('access-control-allow-origin') ?? '';
    // Server returns its configured static value — never echoes back an arbitrary origin.
    // In test env CORS_ORIGIN defaults to '*'. Either '*' or the configured origin is acceptable;
    // what must NOT happen is returning the attacker's origin verbatim.
    expect(acao).not.toBe('http://attacker.example.com');
    expect(acao.length).toBeGreaterThan(0);
  });

  it('Access-Control-Allow-Methods includes GET, POST, OPTIONS', async () => {
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`);
    const acam = res.headers.get('access-control-allow-methods') ?? '';
    expect(acam).toContain('GET');
    expect(acam).toContain('POST');
    expect(acam).toContain('OPTIONS');
  });

  it('Access-Control-Allow-Headers includes Content-Type', async () => {
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`);
    const acah = res.headers.get('access-control-allow-headers') ?? '';
    expect(acah).toContain('Content-Type');
  });
});

describe('OPTIONS preflight', () => {
  let harness: Harness;

  beforeAll(async () => { harness = await startTestServer(); });
  afterAll(async () => { await harness.close(); });

  it('OPTIONS on existing route returns 204 with CORS headers', async () => {
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(res.headers.get('access-control-allow-methods')).toBeTruthy();
    expect(res.headers.get('access-control-allow-headers')).toBeTruthy();
  });

  it('OPTIONS on unknown route returns 204 — preflight does not 404', async () => {
    const res = await fetch(`${harness.baseUrl}/does-not-exist`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('OPTIONS on collection route returns 204', async () => {
    const res = await fetch(`${harness.baseUrl}${API_PROJECTS_PATH}`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('OPTIONS response has no body', async () => {
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`, { method: 'OPTIONS' });
    const text = await res.text();
    expect(text).toBe('');
  });
});

describe('CORS with explicit origin — credentialed auth', () => {
  const EXPLICIT_ORIGIN = 'http://localhost:3000';
  let s: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => { s = await startServerWithOrigin(EXPLICIT_ORIGIN); });
  afterAll(async () => { await s.close(); });

  it('emits the configured explicit origin, not wildcard', async () => {
    const res = await fetch(`${s.baseUrl}${API_HEALTH_PATH}`);
    expect(res.headers.get('access-control-allow-origin')).toBe(EXPLICIT_ORIGIN);
  });

  it('emits Access-Control-Allow-Credentials: true', async () => {
    const res = await fetch(`${s.baseUrl}${API_HEALTH_PATH}`);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('emits Vary: Origin so caches do not serve the wrong response', async () => {
    const res = await fetch(`${s.baseUrl}${API_HEALTH_PATH}`);
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('preflight also carries credentials + explicit origin', async () => {
    const res = await fetch(`${s.baseUrl}${API_HEALTH_PATH}`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(EXPLICIT_ORIGIN);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('never echoes an arbitrary request Origin', async () => {
    const res = await fetch(`${s.baseUrl}${API_HEALTH_PATH}`, {
      headers: { Origin: 'http://attacker.example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(EXPLICIT_ORIGIN);
  });
});

describe('CORS with wildcard — non-credentialed default', () => {
  let harness: Harness;

  beforeAll(async () => { harness = await startTestServer(); });
  afterAll(async () => { await harness.close(); });

  it('emits wildcard origin when CORS_ORIGIN is not configured', async () => {
    expect(process.env['CORS_ORIGIN']).toBeFalsy();
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('does NOT emit Access-Control-Allow-Credentials for wildcard', async () => {
    const res = await fetch(`${harness.baseUrl}${API_HEALTH_PATH}`);
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
