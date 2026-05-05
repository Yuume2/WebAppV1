import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { V5StateStore } from './state.mjs';
import { evaluateResume } from './resume.mjs';

function tmpRepo() { return mkdtempSync(join(tmpdir(), 'v5state-')); }

test('V5StateStore save and load roundtrip', () => {
  const root = tmpRepo();
  try {
    const store = new V5StateStore(root);
    const id = store.newId();
    const saved = store.save({ id, issue: 42, mode: 'plan', status: 'prepared' });
    assert.equal(saved.id, id);
    const loaded = store.load(id);
    assert.equal(loaded.issue, 42);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('V5StateStore rejects bad ids', () => {
  const root = tmpRepo();
  try {
    const store = new V5StateStore(root);
    assert.throws(() => store.save({ id: '../evil', issue: 1, mode: 'plan' }));
    assert.throws(() => store.load('../evil'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('V5StateStore list sorts by updatedAt desc', async () => {
  const root = tmpRepo();
  try {
    const store = new V5StateStore(root);
    const a = store.save({ id: store.newId(), issue: 1, mode: 'plan' });
    await new Promise((r) => setTimeout(r, 10));
    const b = store.save({ id: store.newId(), issue: 2, mode: 'plan' });
    const list = store.list();
    assert.equal(list[0].id, b.id);
    assert.equal(list[1].id, a.id);
    assert.equal(store.latest().id, b.id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('evaluateResume refuses when no run', () => {
  const r = evaluateResume({ run: null });
  assert.equal(r.canResume, false);
});

test('evaluateResume refuses when run still running', () => {
  const r = evaluateResume({ run: { id: 'a', status: 'running' } });
  assert.equal(r.canResume, false);
});

test('evaluateResume refuses when waitingOnQuestion not answered', () => {
  const r = evaluateResume({
    run: { id: 'a', status: 'paused', waitingOnQuestion: 'q1' },
    questions: [{ id: 'q1', status: 'pending' }],
  });
  assert.equal(r.canResume, false);
  assert.match(r.reason, /q1/);
});

test('evaluateResume allows when answered', () => {
  const r = evaluateResume({
    run: { id: 'a', status: 'paused', waitingOnQuestion: 'q1', issue: 42 },
    questions: [{ id: 'q1', status: 'answered' }],
  });
  assert.equal(r.canResume, true);
  assert.equal(r.runId, 'a');
  assert.equal(r.issue, 42);
});

test('evaluateResume refuses when pending questions remain', () => {
  const r = evaluateResume({
    run: { id: 'a', status: 'done' },
    questions: [{ id: 'q1', status: 'pending' }],
  });
  assert.equal(r.canResume, false);
});
