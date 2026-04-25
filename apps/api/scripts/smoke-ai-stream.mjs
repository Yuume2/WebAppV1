#!/usr/bin/env node
/* eslint-disable no-console */
// Local AI streaming smoke for @webapp/api.
// Walks the same flow as smoke-ai.mjs but validates POST /v1/messages/stream:
// receives at least one delta chunk, an assistantMessage in the final event,
// and a [DONE] sentinel. Spends real OpenAI tokens. Not wired into CI.

const BASE_URL = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:4000';
const MODEL    = process.env.SMOKE_MODEL ?? 'gpt-4o-mini';

function fail(msg, extra) {
  console.error(`✗ ${msg}`);
  if (extra !== undefined) console.error(extra);
  process.exit(1);
}

function pass(msg) { console.log(`✓ ${msg}`); }

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

// ── Steps 1–6: identical setup to smoke-ai.mjs ────────────────────────────────

const ts    = Date.now();
const EMAIL = `smoke-stream-${ts}@example.test`;
const PASS  = `smoke-pass-${ts}-${Math.random().toString(36).slice(2)}`;

console.log(`▶ smoke-ai-stream against ${BASE_URL} as ${EMAIL}`);

{
  const { status, body } = await req('GET', '/v1/health');
  if (status !== 200 || !body?.ok) fail(`health: API not reachable at ${BASE_URL} (HTTP ${status})`, body);
  pass('health');
}

const user = await expectOk('signup', req('POST', '/v1/auth/signup', { email: EMAIL, password: PASS }));
if (!user?.id) fail('signup returned no user.id');

const project = await expectOk('create project', req('POST', '/v1/projects', { name: `Smoke Stream ${ts}` }));
const workspace = await expectOk('create workspace', req('POST', '/v1/workspaces', { projectId: project.id, name: 'Smoke WS' }));

await expectOk('upsert openai connection', req('PUT', '/v1/provider-connections/openai', { apiKey: OPENAI_API_KEY }));

const cw = await expectOk(
  'create chat-window',
  req('POST', '/v1/chat-windows', {
    workspaceId: workspace.id,
    title:       'Smoke Stream Chat',
    provider:    'openai',
    model:       MODEL,
  }),
);
if (!cw?.id) fail('chat-window missing id');

// ── Step 7: streaming POST and SSE parse ──────────────────────────────────────

const headers = { 'Content-Type': 'application/json' };
const c = cookieHeader();
if (c) headers['Cookie'] = c;

const startedAt = Date.now();
const res = await fetch(`${BASE_URL}/v1/messages/stream`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ chatWindowId: cw.id, role: 'user', content: 'hello' }),
});

if (res.status !== 200) fail(`stream: HTTP ${res.status}`);
const ct = res.headers.get('content-type') ?? '';
if (!ct.includes('text/event-stream')) fail(`stream: wrong content-type "${ct}"`);
if (!res.body) fail('stream: no response body');
pass(`stream connected (HTTP 200, ${ct})`);

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let deltaCount = 0;
let assistantContent = '';
let finalEvent = null;
let sawDoneSentinel = false;
let firstDeltaAt = 0;

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') { sawDoneSentinel = true; continue; }

    let event;
    try { event = JSON.parse(payload); }
    catch { fail(`stream: malformed JSON in event: ${payload}`); }

    if (typeof event.error === 'string') fail(`stream: server emitted error event: ${event.error}`);
    if (typeof event.delta === 'string') {
      if (deltaCount === 0) firstDeltaAt = Date.now() - startedAt;
      deltaCount += 1;
      assistantContent += event.delta;
    }
    if (event.done === true) finalEvent = event;
  }
}

if (deltaCount === 0)        fail('stream: no delta chunks received');
if (!sawDoneSentinel)        fail('stream: missing [DONE] sentinel');
if (!finalEvent)             fail('stream: no final {done:true} event');
if (!finalEvent.assistantMessage)  fail('stream: final event missing assistantMessage');
if (finalEvent.assistantMessage.role !== 'assistant') fail('stream: assistantMessage role wrong');
if (typeof finalEvent.assistantMessage.content !== 'string' || finalEvent.assistantMessage.content.length === 0) {
  fail('stream: persisted assistant content empty');
}
if (finalEvent.assistantMessage.content !== assistantContent) {
  fail(`stream: streamed content (${assistantContent.length}b) != persisted content (${finalEvent.assistantMessage.content.length}b)`);
}
if (finalEvent.assistantMessage.provider !== 'openai') fail('stream: assistant provider wrong');

const totalMs = Date.now() - startedAt;
pass(`received ${deltaCount} deltas, ${assistantContent.length} chars`);
pass(`first delta at ${firstDeltaAt}ms, full stream in ${totalMs}ms`);
pass(`assistant persisted (id=${finalEvent.assistantMessage.id}, ${finalEvent.assistantMessage.promptTokens ?? '?'}p + ${finalEvent.assistantMessage.completionTokens ?? '?'}c tokens)`);

// ── Step 8: GET /v1/messages confirms persistence ─────────────────────────────

const list = await expectOk(
  'list messages after stream',
  req('GET', `/v1/messages?chatWindowId=${cw.id}`),
);
if (!Array.isArray(list) || list.length < 2) fail(`list: expected ≥2 messages, got ${list?.length}`);
const persisted = list.find((m) => m.id === finalEvent.assistantMessage.id);
if (!persisted) fail('list: assistant message id not found in DB');
pass(`assistant row found in DB after stream`);

console.log('\n✓ smoke-ai-stream PASSED');
