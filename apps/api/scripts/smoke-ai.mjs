#!/usr/bin/env node
/* eslint-disable no-console */
// Local AI smoke test for @webapp/api.
// Walks the full chat flow: signup → project → workspace → openai key →
// chat-window → POST message → expect assistant reply.
// Spends real OpenAI tokens. Not wired into CI on purpose.

const BASE_URL = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:4000';
const MODEL    = process.env.SMOKE_MODEL ?? 'gpt-4o-mini';

function fail(msg, extra) {
  console.error(`✗ ${msg}`);
  if (extra !== undefined) console.error(extra);
  process.exit(1);
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

if (!process.env.OPENAI_API_KEY) {
  fail('OPENAI_API_KEY required (set it in apps/api/.env or in your shell)');
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── Cookie jar ────────────────────────────────────────────────────────────────

const cookies = new Map();

function captureCookies(setCookie) {
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const raw of list) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  if (cookies.size === 0) return undefined;
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const c = cookieHeader();
  if (c) headers['Cookie'] = c;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  // Capture every Set-Cookie header (Node fetch returns a single string).
  captureCookies(res.headers.getSetCookie?.() ?? res.headers.get('set-cookie'));
  let json = null;
  if (res.status !== 204) {
    try { json = await res.json(); } catch { /* not json */ }
  }
  return { status: res.status, body: json };
}

async function expectOk(label, p) {
  const { status, body } = await p;
  if (status >= 400 || !body || body.ok !== true) {
    const errCode = body?.error?.code ?? '<no-envelope>';
    fail(`${label}: HTTP ${status} (${errCode})`, body);
  }
  pass(`${label} (HTTP ${status})`);
  return body.data;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const ts    = Date.now();
const EMAIL = `smoke-${ts}@example.test`;
const PASS  = `smoke-pass-${ts}-${Math.random().toString(36).slice(2)}`;

console.log(`▶ smoke-ai against ${BASE_URL} as ${EMAIL}`);

// 1. Health
{
  const { status, body } = await req('GET', '/v1/health');
  if (status !== 200 || !body?.ok) {
    fail(`health: API not reachable at ${BASE_URL} (HTTP ${status})`, body);
  }
  pass('health');
}

// 2. Signup
const user = await expectOk('signup', req('POST', '/v1/auth/signup', { email: EMAIL, password: PASS }));
if (!user?.id) fail('signup returned no user.id');

// 3. Project
const project = await expectOk('create project', req('POST', '/v1/projects', { name: `Smoke ${ts}` }));
if (!project?.id) fail('project missing id');

// 4. Workspace
const workspace = await expectOk(
  'create workspace',
  req('POST', '/v1/workspaces', { projectId: project.id, name: 'Smoke WS' }),
);
if (!workspace?.id) fail('workspace missing id');

// 5. OpenAI connection (apiKey from env, never printed)
await expectOk(
  'upsert openai connection',
  req('PUT', '/v1/provider-connections/openai', { apiKey: OPENAI_API_KEY }),
);

// 6. Chat window
const cw = await expectOk(
  'create chat-window',
  req('POST', '/v1/chat-windows', {
    workspaceId: workspace.id,
    title:       'Smoke Chat',
    provider:    'openai',
    model:       MODEL,
  }),
);
if (!cw?.id) fail('chat-window missing id');

// 7. Send message + verify assistant reply
const pair = await expectOk(
  'POST message "hello"',
  req('POST', '/v1/messages', {
    chatWindowId: cw.id,
    role:         'user',
    content:      'hello',
  }),
);

if (!pair?.assistantMessage) fail('no assistantMessage in response');
const am = pair.assistantMessage;
if (am.role !== 'assistant')   fail(`assistant role wrong: ${am.role}`);
if (typeof am.content !== 'string' || am.content.length === 0) {
  fail('assistant content empty');
}
if (am.provider !== 'openai')  fail(`assistant provider wrong: ${am.provider}`);

pass(`assistant reply (${am.content.length} chars, ${am.promptTokens ?? '?'} prompt + ${am.completionTokens ?? '?'} completion tokens, ${am.latencyMs ?? '?'}ms)`);

console.log('\n✓ smoke-ai PASSED');
