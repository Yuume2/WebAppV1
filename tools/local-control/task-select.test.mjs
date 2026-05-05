import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { selectBestTask, evaluateRunnability, classifyTaskBlockers } from './task-select.mjs';

test('selectBestTask returns ok=false with explicit reason when no items', () => {
  const r = selectBestTask({ items: [], settings: { allowExec: false } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /aucune issue/);
});

test('selectBestTask picks the safe task', () => {
  const r = selectBestTask({
    items: [
      { number: 10, labels: ['ai:autonomous', 'risk:safe'], score: 8, title: 'safe one' },
      { number: 11, labels: ['risk:destructive'], score: 9, title: 'destructive' },
    ],
    settings: { allowExec: true }, claudeAvailable: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.best.number, 10);
  assert.equal(r.runnability.canExec, true);
});

test('selectBestTask reports blocked tasks with reasons', () => {
  const r = selectBestTask({
    items: [
      { number: 1, labels: ['ai:autonomous', 'risk:safe'], score: 5, title: 'safe' },
      { number: 2, labels: ['ai:autonomous', 'risk:safe', 'ai:human-checkpoint'], score: 9, title: 'human checkpoint' },
      { number: 3, labels: ['ai:autonomous'], title: 'no risk label' },
    ],
    settings: {},
  });
  assert.equal(r.best.number, 1);
  const blockedNums = r.blocked.map((b) => b.number).sort();
  assert.deepEqual(blockedNums, [2, 3]);
  const human = r.blocked.find((b) => b.number === 2);
  assert.ok(human.reasons.some((x) => x.includes('ai:human-checkpoint')));
});

test('evaluateRunnability flags allowExec=false as plan-only', () => {
  const r = evaluateRunnability({ task: { number: 1 }, settings: { allowExec: false }, claudeAvailable: true });
  assert.equal(r.canPlan, true);
  assert.equal(r.canExec, false);
  assert.ok(r.blockers.some((b) => b.includes('allowExec')));
});

test('evaluateRunnability flags Claude indispo', () => {
  const r = evaluateRunnability({ task: { number: 1 }, settings: { allowExec: true }, claudeAvailable: false });
  assert.equal(r.canExec, false);
  assert.ok(r.blockers.some((b) => b.includes('Claude')));
});

test('classifyTaskBlockers detects missing required labels', () => {
  const r = classifyTaskBlockers({ labels: ['ai:autonomous'] });
  assert.equal(r.safe, false);
  assert.ok(r.reasons.some((x) => x.includes('risk:safe')));
});
