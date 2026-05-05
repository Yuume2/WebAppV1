import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MISSION_MODES, DEFAULT_MODE_ID, findMode, buildMissionState } from '../public/lib/mission.js';

test('MISSION_MODES includes all 7 modes', () => {
  const ids = MISSION_MODES.map((m) => m.id).sort();
  assert.deepEqual(ids, ['auto1', 'auto5', 'custom', 'full', 'loop10', 'loop20', 'manual']);
});

test('DEFAULT_MODE_ID is auto5', () => {
  assert.equal(DEFAULT_MODE_ID, 'auto5');
});

test('findMode returns default when id unknown', () => {
  assert.equal(findMode('not-a-mode').id, 'auto5');
});

test('findMode("manual") does not require exec', () => {
  const m = findMode('manual');
  assert.equal(m.requiresExec, false);
});

test('findMode("auto5") requires exec and loop', () => {
  const m = findMode('auto5');
  assert.equal(m.requiresExec, true);
  assert.equal(m.requiresLoop, true);
  assert.equal(m.maxPrs, 5);
});

test('findMode("loop20") has 20 PRs cap', () => {
  assert.equal(findMode('loop20').maxPrs, 20);
});

test('buildMissionState reports blockers when exec missing for auto5', () => {
  const s = buildMissionState({
    mode: 'auto5',
    settings: { allowExec: false, allowLoop: false },
    v5: { claudeAvailable: true },
    ap: null,
  });
  assert.ok(s.blockers.find((b) => b.text.includes('Exec disabled')));
  assert.ok(s.blockers.find((b) => b.text.includes('Loop disabled')));
});

test('buildMissionState ready text for auto5 when settings ok', () => {
  const s = buildMissionState({
    mode: 'auto5',
    settings: { allowExec: true, allowLoop: true },
    v5: { claudeAvailable: true },
    ap: null,
  });
  assert.equal(s.blockers.length, 0);
  assert.match(s.title, /Ready to run 5 safe tasks/);
});

test('buildMissionState shows manual prompt title for manual mode', () => {
  const s = buildMissionState({
    mode: 'manual',
    settings: { allowExec: false },
    v5: { claudeAvailable: true },
    ap: null,
  });
  assert.match(s.title, /Manual prompt/);
  assert.match(s.ctaLabel, /Generate prompt/);
});

test('buildMissionState reflects waiting state', () => {
  const s = buildMissionState({
    mode: 'auto5',
    settings: { allowExec: true, allowLoop: true },
    v5: { claudeAvailable: true },
    ap: { status: 'waiting', pendingQuestionId: 'q-7' },
  });
  assert.match(s.title, /Décision humaine/);
  assert.equal(s.orbClass, 'warn');
  assert.equal(s.ctaLabel, 'Resume');
});

test('buildMissionState reflects running state with issue', () => {
  const s = buildMissionState({
    mode: 'auto5',
    settings: { allowExec: true, allowLoop: true },
    v5: { claudeAvailable: true },
    ap: { status: 'running', issue: 41, currentStep: 'launching-claude' },
  });
  assert.match(s.title, /#41/);
  assert.equal(s.orbClass, 'running');
  assert.equal(s.ctaDisabled, true);
});

test('buildMissionState shows completed PR count', () => {
  const s = buildMissionState({
    mode: 'auto5',
    settings: { allowExec: true, allowLoop: true },
    v5: { claudeAvailable: true },
    ap: { status: 'completed', prsCreated: 3, lastPR: { number: 42, url: 'http://x/42' } },
  });
  assert.match(s.title, /3 PR/);
  assert.equal(s.ctaLabel, 'Review PR');
});

test('buildMissionState full mode triggers checklist message when readiness not ready', () => {
  const s = buildMissionState({
    mode: 'full',
    settings: { allowExec: true, allowLoop: true },
    v5: { claudeAvailable: true },
    ap: null,
    fullReadiness: { ready: false, summary: '2 required item(s) missing' },
  });
  assert.ok(s.blockers.length);
  assert.match(s.subtitle, /checklist|Coche/);
});

test('buildMissionState custom mode honours customMax', () => {
  const s = buildMissionState({
    mode: 'custom',
    settings: { allowExec: true, allowLoop: true },
    v5: { claudeAvailable: true },
    ap: null,
    customMax: 12,
  });
  assert.match(s.title, /12 safe tasks/);
});

test('buildMissionState claude missing → danger blocker', () => {
  const s = buildMissionState({
    mode: 'auto1',
    settings: { allowExec: true, allowLoop: false },
    v5: { claudeAvailable: false, claudeReason: 'not in PATH' },
    ap: null,
  });
  assert.ok(s.blockers.find((b) => b.kind === 'danger'));
});
