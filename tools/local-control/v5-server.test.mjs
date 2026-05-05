import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './server.mjs';

function tmpRepo() {
  const root = mkdtempSync(join(tmpdir(), 'v5-server-'));
  mkdirSync(join(root, '.local-control'), { recursive: true });
  return root;
}

async function call(app, method, path, { body, token } = {}) {
  return new Promise((resolveP) => {
    const headers = { authorization: token ? `Bearer ${token}` : '' };
    const req = {
      method,
      url: path,
      headers,
      on: (ev, cb) => { if (ev === 'end' && body == null) cb(); if (ev === 'data' && body) cb(Buffer.from(body)); if (ev === 'end' && body) cb(); },
      destroy: () => {},
    };
    let status = 0;
    let data = '';
    const res = {
      writeHead: (c) => { status = c; },
      end: (chunk) => { if (chunk) data += chunk; resolveP({ status, data: tryJson(data) }); },
      write: () => {},
    };
    app.handler(req, res);
  });
}
function tryJson(s) { try { return JSON.parse(s); } catch { return s; } }

test('GET /api/v5/status without auth returns 401', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const r = await call(app, 'GET', '/api/v5/status');
    assert.equal(r.status, 401);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/v5/status reports missing env when v5.env empty', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'GET', '/api/v5/status', { token: tok });
    assert.equal(r.status, 200);
    assert.equal(r.data.notionConfigured, false);
    assert.equal(r.data.n8nConfigured, false);
    assert.equal(r.data.whatsappConfigured, false);
    assert.ok(Array.isArray(r.data.nextHumanActions));
    assert.equal(r.data.autoMergeAllowed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/v5/status detects Notion when env set', async () => {
  const root = tmpRepo();
  writeFileSync(join(root, '.local-control', 'v5.env'),
    'CLAUDE_CODE_COMMAND=yu\nCLAUDE_CODE_MODE=cli\nGITHUB_OWNER=x\nGITHUB_REPO=y\nNOTION_TOKEN=t\nNOTION_QUESTIONS_DATABASE_ID=d\n');
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'GET', '/api/v5/status', { token: tok });
    assert.equal(r.status, 200);
    assert.equal(r.data.notionConfigured, true);
    assert.equal(r.data.claudeCommand, 'yu');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/v5/prepare-run rejects bad issue', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'POST', '/api/v5/prepare-run', { token: tok, body: JSON.stringify({ issue: 0 }) });
    assert.equal(r.status, 422);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/v5/prepare-run persists state and returns prompt', async () => {
  const root = tmpRepo();
  writeFileSync(join(root, '.local-control', 'v5.env'), 'CLAUDE_CODE_COMMAND=yu\n');
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'POST', '/api/v5/prepare-run', { token: tok, body: JSON.stringify({ issue: 42, mode: 'plan' }) });
    assert.equal(r.status, 200);
    assert.equal(r.data.ready, true);
    assert.match(r.data.prompt, /#42/);
    assert.ok(r.data.runId);

    const st = await call(app, 'GET', '/api/state', { token: tok });
    assert.equal(st.status, 200);
    assert.equal(st.data.items.length, 1);
    assert.equal(st.data.items[0].issue, 42);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/automerge/apply refuses when allowAutoMerge=false', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'POST', '/api/automerge/apply', { token: tok, body: JSON.stringify({ pr: 1 }) });
    assert.equal(r.status, 403);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/resume returns canResume=false when no state', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'POST', '/api/resume', { token: tok, body: JSON.stringify({}) });
    assert.equal(r.status, 200);
    assert.equal(r.data.canResume, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/autopilot/status without auth returns 401', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const r = await call(app, 'GET', '/api/autopilot/status');
    assert.equal(r.status, 401);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/autopilot/status returns idle autopilot=null initially', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'GET', '/api/autopilot/status', { token: tok });
    assert.equal(r.status, 200);
    assert.equal(r.data.autopilot, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('POST /api/autopilot/stop returns ok=false when no run', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'POST', '/api/autopilot/stop', { token: tok, body: JSON.stringify({}) });
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/v5/status surfaces autoMergeMode and notion/n8n flags', async () => {
  const root = tmpRepo();
  writeFileSync(join(root, '.local-control', 'v5.env'),
    'CLAUDE_CODE_COMMAND=yu\nNOTION_TOKEN=x\nNOTION_QUESTIONS_DATABASE_ID=db\nN8N_BASE_URL=https://n8n\nN8N_WEBHOOK_SECRET=s\n');
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'GET', '/api/v5/status', { token: tok });
    assert.equal(r.status, 200);
    assert.equal(r.data.notionConfigured, true);
    assert.equal(r.data.n8nConfigured, true);
    assert.equal(r.data.autoMergeMode, 'OFF');
    assert.equal(r.data.notion.stage, 'configured');
    assert.equal(r.data.n8n.stage, 'base-only');
    assert.match(r.data.n8n.summary, /webhooks missing/);
    assert.deepEqual(r.data.n8nMissingWebhooks.sort(), ['N8N_NOTION_ANSWER_WEBHOOK', 'N8N_QUESTION_NOTIFY_WEBHOOK'].sort());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/v5/status with empty notion env reports stage missing-all', async () => {
  const root = tmpRepo();
  writeFileSync(join(root, '.local-control', 'v5.env'), 'CLAUDE_CODE_COMMAND=yu\n');
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'GET', '/api/v5/status', { token: tok });
    assert.equal(r.data.notion.stage, 'missing-all');
    assert.equal(r.data.n8n.stage, 'missing-all');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GET /api/tasks/best returns 200 with structured payload', async () => {
  const root = tmpRepo();
  try {
    const app = buildApp({ repoRoot: root });
    const tok = app.settings.get().authToken;
    const r = await call(app, 'GET', '/api/tasks/best', { token: tok });
    assert.equal(r.status, 200);
    assert.ok(typeof r.data === 'object');
    assert.ok('ok' in r.data);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
