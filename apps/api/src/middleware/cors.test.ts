import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_PROJECTS_PATH, API_HEALTH_PATH } from '@webapp/types';
import { startTestServer, type Harness } from '../test/server-harness.js';

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
