import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { buildApp } from './server.mjs';

function mkroot() {
  const root = mkdtempSync(resolve(tmpdir(), 'lc-server-'));
  mkdirSync(resolve(root, '.git'), { recursive: true });
  writeFileSync(resolve(root, '.git', 'HEAD'), 'ref: refs/heads/test\n');
  return root;
}

async function listenApp(handler) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function close(server) { await new Promise((r) => server.close(r)); }

test('rejects unauthenticated /api/status', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/status`);
    assert.equal(r.status, 401);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('accepts Bearer token for /api/status', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/status`, { headers: { authorization: `Bearer ${tok}` } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/settings never exposes authToken', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/settings`, { headers: { authorization: `Bearer ${tok}` } });
    const j = await r.json();
    assert.equal(j.authToken, undefined);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/command rejects non-whitelisted', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/command`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'rm', args: ['-rf', '/'] }),
    });
    assert.equal(r.status, 422);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/run/start refused when allowExec false', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/run/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ issue: 1, dryRun: false }),
    });
    assert.equal(r.status, 403);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/automerge/apply refused when allowAutoMerge false', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/automerge/apply`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pr: 1 }),
    });
    assert.equal(r.status, 403);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('PUT /api/settings updates and never echoes token', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ maxPrsPerRun: 5 }),
    });
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.settings.maxPrsPerRun, 5);
    assert.equal(j.settings.authToken, undefined);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/health alias works', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/health`, { headers: { authorization: `Bearer ${tok}` } });
    assert.equal(r.status, 200);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('SSE endpoint requires token via query', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/logs/nope`);
    assert.equal(r.status, 401);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runner stop is idempotent for unknown id', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/run/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'does-not-exist' }),
    });
    const j = await r.json();
    assert.equal(j.ok, false);
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/network returns local URL and lan flags', async () => {
  const root = mkroot();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const { server, base } = await listenApp(app.handler);
    const r = await fetch(`${base}/api/network`, { headers: { authorization: `Bearer ${tok}` } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.localUrl.startsWith('http://127.0.0.1:'));
    assert.equal(typeof j.lanEnabled, 'boolean');
    assert.equal(typeof j.tokenRequired, 'boolean');
    await close(server);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
