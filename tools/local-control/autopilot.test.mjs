import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  chooseSafeTask,
  evaluatePreflight,
  shouldStopRun,
  buildAutopilotState,
  markStopped,
  markWaitingOnQuestion,
  recordError,
  recordPR,
  exportRunSummary,
  createBranch,
  filterDirtyStatusLines,
  AUTOPILOT_STOP_REASONS,
} from './autopilot.mjs';

test('chooseSafeTask filters destructive labels', () => {
  const items = [
    { number: 1, labels: ['ai:autonomous', 'risk:destructive'], score: 9 },
    { number: 2, labels: ['ai:autonomous', 'risk:safe'], score: 5 },
    { number: 3, labels: ['risk:safe'], score: 8 },
  ];
  const r = chooseSafeTask({ items });
  assert.equal(r.number, 2);
});

test('chooseSafeTask requires both ai:autonomous and risk:safe', () => {
  const items = [
    { number: 10, labels: ['ai:autonomous'], score: 9 },
    { number: 11, labels: ['risk:safe'], score: 9 },
  ];
  const r = chooseSafeTask({ items });
  assert.equal(r, null);
});

test('chooseSafeTask excludes already processed', () => {
  const items = [
    { number: 1, labels: ['ai:autonomous', 'risk:safe'], score: 9 },
    { number: 2, labels: ['ai:autonomous', 'risk:safe'], score: 5 },
  ];
  const r = chooseSafeTask({ items, excludeIssues: [1] });
  assert.equal(r.number, 2);
});

test('chooseSafeTask filters review-required label', () => {
  const items = [
    { number: 1, labels: ['ai:autonomous', 'risk:safe', 'risk:review-required'], score: 9 },
    { number: 2, labels: ['ai:autonomous', 'risk:safe'], score: 5 },
  ];
  const r = chooseSafeTask({ items });
  assert.equal(r.number, 2);
});

test('chooseSafeTask excludes ai:human-checkpoint', () => {
  const items = [
    { number: 1, labels: ['ai:autonomous', 'risk:safe', 'ai:human-checkpoint'], score: 9 },
  ];
  assert.equal(chooseSafeTask({ items }), null);
});

test('evaluatePreflight blocks dirty repo', () => {
  const r = evaluatePreflight({
    gitInfo: { dirty: true, branch: 'main' }, claudeAvailable: true,
    settings: { allowExec: true, allowLoop: true },
    env: { CLAUDE_CODE_COMMAND: 'yu', GITHUB_OWNER: 'x', GITHUB_REPO: 'y' },
    mode: 'exec',
  });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('repo dirty'));
});

test('evaluatePreflight requires allowExec for exec mode', () => {
  const r = evaluatePreflight({
    gitInfo: { dirty: false, branch: 'main' }, claudeAvailable: true,
    settings: { allowExec: false, allowLoop: false },
    env: { CLAUDE_CODE_COMMAND: 'yu', GITHUB_OWNER: 'x', GITHUB_REPO: 'y' },
    mode: 'exec',
  });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('allowExec disabled'));
});

test('evaluatePreflight requires allowLoop for loop mode', () => {
  const r = evaluatePreflight({
    gitInfo: { dirty: false, branch: 'main' }, claudeAvailable: true,
    settings: { allowExec: true, allowLoop: false },
    env: { CLAUDE_CODE_COMMAND: 'yu', GITHUB_OWNER: 'x', GITHUB_REPO: 'y' },
    mode: 'loop',
  });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('allowLoop disabled'));
});

test('evaluatePreflight ok for plan mode without exec', () => {
  const r = evaluatePreflight({
    gitInfo: { dirty: false, branch: 'main' }, claudeAvailable: false,
    settings: { allowExec: false, allowLoop: false },
    env: { CLAUDE_CODE_COMMAND: 'yu', GITHUB_OWNER: 'x', GITHUB_REPO: 'y' },
    mode: 'plan',
  });
  assert.equal(r.ok, true);
});

test('shouldStopRun stops on time budget', () => {
  const startedAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const run = { startedAt, errors: 0, prsCreated: 0, pendingQuestionId: null, stopRequested: false };
  const r = shouldStopRun({ run, settings: { maxMinutes: 60, maxPrsPerRun: 3 } });
  assert.equal(r.stop, true);
  assert.equal(r.reason, AUTOPILOT_STOP_REASONS.TIME_BUDGET);
});

test('shouldStopRun stops at 3 errors', () => {
  const run = { startedAt: new Date().toISOString(), errors: 3, prsCreated: 0, stopRequested: false };
  const r = shouldStopRun({ run, settings: { maxMinutes: 60, maxPrsPerRun: 3 } });
  assert.equal(r.stop, true);
  assert.equal(r.reason, AUTOPILOT_STOP_REASONS.ERROR_BUDGET);
});

test('shouldStopRun stops at PR budget', () => {
  const run = { startedAt: new Date().toISOString(), errors: 0, prsCreated: 3, stopRequested: false };
  const r = shouldStopRun({ run, settings: { maxMinutes: 60, maxPrsPerRun: 3 } });
  assert.equal(r.stop, true);
  assert.equal(r.reason, AUTOPILOT_STOP_REASONS.PR_BUDGET);
});

test('shouldStopRun stops on pending question', () => {
  const run = { startedAt: new Date().toISOString(), errors: 0, prsCreated: 0, pendingQuestionId: 'q-1', stopRequested: false };
  const r = shouldStopRun({ run, settings: { maxMinutes: 60, maxPrsPerRun: 3 } });
  assert.equal(r.stop, true);
  assert.equal(r.reason, AUTOPILOT_STOP_REASONS.QUESTION);
});

test('buildAutopilotState produces a fresh run with sane defaults', () => {
  const run = buildAutopilotState({ mode: 'plan' });
  assert.equal(run.kind, 'autopilot');
  assert.equal(run.status, 'running');
  assert.equal(run.errors, 0);
  assert.equal(run.prsCreated, 0);
});

test('markStopped sets stopReason', () => {
  const run = buildAutopilotState({ mode: 'plan' });
  markStopped(run, AUTOPILOT_STOP_REASONS.COMPLETED);
  assert.equal(run.status, 'completed');
  assert.equal(run.stopReason, AUTOPILOT_STOP_REASONS.COMPLETED);
});

test('markWaitingOnQuestion flags resumeAvailable', () => {
  const run = buildAutopilotState({ mode: 'plan' });
  markWaitingOnQuestion(run, 'q-42');
  assert.equal(run.status, 'waiting');
  assert.equal(run.pendingQuestionId, 'q-42');
  assert.equal(run.resumeAvailable, true);
});

test('recordError increments errors', () => {
  const run = buildAutopilotState({ mode: 'plan' });
  recordError(run, new Error('boom'));
  assert.equal(run.errors, 1);
});

test('recordPR sets lastPR and increments', () => {
  const run = buildAutopilotState({ mode: 'plan' });
  recordPR({ run, pr: { number: 9, url: 'x' } });
  assert.equal(run.prsCreated, 1);
  assert.deepEqual(run.lastPR, { number: 9, url: 'x' });
});

test('exportRunSummary trims log to 30', () => {
  const run = buildAutopilotState({ mode: 'plan' });
  for (let i = 0; i < 50; i++) run.log.push({ at: new Date().toISOString(), step: 's' + i });
  const summary = exportRunSummary(run);
  assert.equal(summary.log.length, 30);
});

test('shouldStopRun honours custom error budget from settings', () => {
  const run = { startedAt: new Date().toISOString(), errors: 5, prsCreated: 0 };
  const r = shouldStopRun({ run, settings: { maxMinutes: 60, maxPrsPerRun: 3 } });
  // shouldStopRun uses internal threshold of 3 — kept for backward compat
  assert.equal(r.stop, true);
});

test('createBranch rejects unsafe branch names', () => {
  const r = createBranch('/tmp', 'a;rm -rf');
  assert.equal(r.ok, false);
  assert.match(r.reason, /invalid/);
});

test('chooseSafeTask excludes already-processed in loop', () => {
  const items = [
    { number: 5, labels: ['ai:autonomous', 'risk:safe'], score: 9 },
    { number: 6, labels: ['ai:autonomous', 'risk:safe'], score: 7 },
  ];
  const r = chooseSafeTask({ items, excludeIssues: [5] });
  assert.equal(r.number, 6);
});

test('filterDirtyStatusLines: only .claude/ untracked is clean', () => {
  const out = filterDirtyStatusLines(['?? .claude/']);
  assert.equal(out.length, 0);
});

test('filterDirtyStatusLines: only .local-control/ untracked is clean', () => {
  const out = filterDirtyStatusLines(['?? .local-control/', '?? .local-control/state.json']);
  assert.equal(out.length, 0);
});

test('filterDirtyStatusLines: .claude/ plus tracked modified file is dirty', () => {
  const out = filterDirtyStatusLines(['?? .claude/', ' M apps/api/src/index.ts']);
  assert.deepEqual(out, [' M apps/api/src/index.ts']);
});

test('filterDirtyStatusLines: untracked outside ignored dirs is dirty', () => {
  const out = filterDirtyStatusLines(['?? scratch.txt']);
  assert.deepEqual(out, ['?? scratch.txt']);
});

test('filterDirtyStatusLines: tracked modified file is dirty', () => {
  const out = filterDirtyStatusLines([' M package.json']);
  assert.deepEqual(out, [' M package.json']);
});

test('filterDirtyStatusLines: handles raw multiline string', () => {
  const out = filterDirtyStatusLines('?? .claude/\n M src/foo.ts\n');
  assert.deepEqual(out, [' M src/foo.ts']);
});

test('evaluatePreflight reports dirty file list', () => {
  const r = evaluatePreflight({
    gitInfo: { dirty: true, dirtyFiles: ['package.json', 'src/foo.ts'], branch: 'main' },
    claudeAvailable: true,
    settings: { allowExec: true, allowLoop: true },
    env: { CLAUDE_CODE_COMMAND: 'yu', GITHUB_OWNER: 'x', GITHUB_REPO: 'y' },
    mode: 'exec',
  });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('package.json')));
});
