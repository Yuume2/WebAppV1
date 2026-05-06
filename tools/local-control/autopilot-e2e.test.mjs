import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  AutopilotEngine,
  AUTOPILOT_STOP_REASONS,
  buildAutopilotState,
  exportRunSummary,
  markStopped,
  recordError,
} from './autopilot.mjs';

function fakeStore() {
  const map = new Map();
  return {
    save(r) { map.set(r.id, JSON.parse(JSON.stringify(r))); return r; },
    load(id) { return map.has(id) ? JSON.parse(JSON.stringify(map.get(id))) : null; },
    list({ limit = 30 } = {}) { return Array.from(map.values()).slice(0, limit); },
  };
}

function fakeSettings(overrides = {}) {
  const s = { allowExec: true, allowLoop: false, maxPrsPerRun: 1, maxMinutes: 60, maxErrors: 3, staleDays: 7, ...overrides };
  return { get: () => s };
}

test('exportRunSummary maps progressPercent from currentStep', () => {
  const r = buildAutopilotState({ mode: 'exec' });
  r.currentStep = 'claude-running';
  const s = exportRunSummary(r);
  assert.equal(s.progressPercent, 50);
});

test('exportRunSummary keeps progress on failed run', () => {
  const r = buildAutopilotState({ mode: 'exec' });
  r.currentStep = 'claude-running';
  recordError(r, new Error('boom'));
  markStopped(r, AUTOPILOT_STOP_REASONS.CLAUDE_FAILED);
  const s = exportRunSummary(r);
  assert.equal(s.status, 'failed');
  assert.equal(s.progressPercent >= 50, true);
  assert.equal(s.lastError, 'boom');
  assert.equal(s.stopReason, AUTOPILOT_STOP_REASONS.CLAUDE_FAILED);
});

test('exportRunSummary completed run sets progressPercent=100', () => {
  const r = buildAutopilotState({ mode: 'exec' });
  r.currentStep = 'pr-created';
  r.prsCreated = 1;
  r.prUrl = 'https://x/pr/1';
  r.prNumber = 1;
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  const s = exportRunSummary(r);
  assert.equal(s.status, 'completed');
  assert.equal(s.progressPercent, 100);
  assert.equal(s.prUrl, 'https://x/pr/1');
});

test('markStopped with NO_PR_PRODUCED yields failed status', () => {
  const r = buildAutopilotState({ mode: 'exec' });
  markStopped(r, AUTOPILOT_STOP_REASONS.NO_PR_PRODUCED);
  assert.equal(r.status, 'failed');
  assert.equal(r.stopReason, AUTOPILOT_STOP_REASONS.NO_PR_PRODUCED);
  assert.equal(r.nextAction, 'retry-or-inspect');
});

test('markStopped with CLAUDE_FAILED yields failed status', () => {
  const r = buildAutopilotState({ mode: 'exec' });
  markStopped(r, AUTOPILOT_STOP_REASONS.CLAUDE_FAILED);
  assert.equal(r.status, 'failed');
});

test('markStopped with STOPPED yields stopped (not failed)', () => {
  const r = buildAutopilotState({ mode: 'exec' });
  markStopped(r, AUTOPILOT_STOP_REASONS.STOPPED);
  assert.equal(r.status, 'stopped');
});

test('engine.current() preserves last completed run after finish', () => {
  const engine = new AutopilotEngine({
    repoRoot: '/tmp', settings: fakeSettings(), store: fakeStore(), logs: null, env: {},
    claudeAdapter: { available: true, prepare: () => ({ command: 'mock', prompt: 'p' }), launch: () => ({ ok: false, reason: 'no exec in test' }) },
    dryRun: false,
  });
  // simulate a finished run by attaching it
  const r = buildAutopilotState({ mode: 'exec' });
  r.currentStep = 'pr-created';
  r.prUrl = 'http://x/pr/2';
  r.prNumber = 2;
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  engine.activeRun = r;
  const cur = engine.current();
  assert.ok(cur);
  assert.equal(cur.status, 'completed');
  assert.equal(cur.prUrl, 'http://x/pr/2');
});

test('engine.reset() refuses while running, accepts when finished', () => {
  const engine = new AutopilotEngine({
    repoRoot: '/tmp', settings: fakeSettings(), store: fakeStore(), logs: null, env: {},
    claudeAdapter: { available: true, prepare: () => ({}), launch: () => ({ ok: false }) },
  });
  const running = buildAutopilotState({ mode: 'exec' }); // status=running
  engine.activeRun = running;
  assert.equal(engine.reset().ok, false);
  markStopped(running, AUTOPILOT_STOP_REASONS.COMPLETED);
  assert.equal(engine.reset().ok, true);
  assert.equal(engine.activeRun, null);
});

test('hasActive() false when last run is completed', () => {
  const engine = new AutopilotEngine({
    repoRoot: '/tmp', settings: fakeSettings(), store: fakeStore(), logs: null, env: {},
    claudeAdapter: { available: true },
  });
  const r = buildAutopilotState({ mode: 'exec' });
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  engine.activeRun = r;
  assert.equal(engine.hasActive(), false);
});

test('hasActive() true when last run is waiting (resumable)', () => {
  const engine = new AutopilotEngine({
    repoRoot: '/tmp', settings: fakeSettings(), store: fakeStore(), logs: null, env: {},
    claudeAdapter: { available: true },
  });
  const r = buildAutopilotState({ mode: 'exec' });
  r.status = 'waiting';
  engine.activeRun = r;
  assert.equal(engine.hasActive(), true);
});

test('engine.history() returns persisted runs', () => {
  const store = fakeStore();
  const r1 = buildAutopilotState({ mode: 'exec' });
  markStopped(r1, AUTOPILOT_STOP_REASONS.COMPLETED);
  store.save(r1);
  const engine = new AutopilotEngine({
    repoRoot: '/tmp', settings: fakeSettings(), store, logs: null, env: {},
    claudeAdapter: { available: true },
  });
  const h = engine.history({ limit: 5 });
  assert.equal(h.length, 1);
  assert.equal(h[0].status, 'completed');
});
