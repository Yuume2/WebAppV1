import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MissionNotifier, evaluateNotifierStatus, MISSION_EVENTS, buildNullNotifier } from './notifier.mjs';

test('evaluateNotifierStatus reports no-providers when env empty', () => {
  const s = evaluateNotifierStatus({});
  assert.equal(s.anyReady, false);
  assert.equal(s.fallback, 'local-only');
  const n8n = s.providers.find((p) => p.id === 'n8n');
  assert.equal(n8n.ready, false);
});

test('evaluateNotifierStatus marks n8n ready when base + question webhook configured', () => {
  const s = evaluateNotifierStatus({
    N8N_BASE_URL: 'https://n.example.com',
    N8N_WEBHOOK_SECRET: 'shh',
    N8N_QUESTION_NOTIFY_WEBHOOK: 'https://n.example.com/q',
  });
  const n8n = s.providers.find((p) => p.id === 'n8n');
  assert.equal(n8n.ready, true);
  assert.equal(s.anyReady, true);
});

test('notify with no env does not crash, returns ok with non-configured dispatch', async () => {
  const n = new MissionNotifier({ env: {} });
  const r = await n.notify('mission_started', { runId: 'a' });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.dispatched));
  for (const d of r.dispatched) assert.equal(d.ok, false);
});

test('notify rejects unknown events', async () => {
  const n = new MissionNotifier({ env: {} });
  const r = await n.notify('unknown_event', {});
  assert.equal(r.ok, false);
});

test('MISSION_EVENTS contains expected lifecycle hooks', () => {
  for (const e of ['mission_started', 'issue_failed', 'pr_created', 'question_required', 'mission_completed']) {
    assert.ok(MISSION_EVENTS.includes(e), `missing ${e}`);
  }
});

test('notify redacts sensitive payload keys', async () => {
  const n = new MissionNotifier({ env: {} });
  const r = await n.notify('mission_started', { token: 'top-secret', runId: 'x' });
  assert.equal(r.recorded.payload.runId, 'x');
  assert.equal(r.recorded.payload.token, undefined);
});

test('notifier records recent events with cap', async () => {
  const n = new MissionNotifier({ env: {} });
  for (let i = 0; i < 5; i++) await n.notify('pr_created', { i });
  const recent = n.recent({ limit: 3 });
  assert.equal(recent.length, 3);
});

test('notifier partial n8n config (base only) does not block', async () => {
  const n = new MissionNotifier({ env: { N8N_BASE_URL: 'https://n.example.com', N8N_WEBHOOK_SECRET: 's' } });
  const r = await n.notify('mission_completed', { ok: true });
  assert.equal(r.ok, true);
  const n8n = r.dispatched.find((d) => d.provider === 'n8n');
  assert.equal(n8n.ok, false);
  assert.match(n8n.reason, /not configured/);
});

test('whatsapp optional missing does not crash', async () => {
  const n = new MissionNotifier({ env: {} });
  const r = await n.notify('issue_failed', { issue: 42 });
  const w = r.dispatched.find((d) => d.provider === 'whatsapp');
  assert.equal(w.ok, false);
  assert.equal(r.ok, true);
});

test('buildNullNotifier never crashes', async () => {
  const n = buildNullNotifier();
  const r = await n.notify('anything', {});
  assert.equal(r.ok, true);
});
