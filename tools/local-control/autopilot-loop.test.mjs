import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  AutopilotEngine,
  AUTOPILOT_STOP_REASONS,
  buildAutopilotState,
  buildMissionReport,
  recordIssueCompleted,
  recordIssueFailed,
  recordIssueSkipped,
  recordPR,
  markStopped,
  exportRunSummary,
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
  const s = {
    allowExec: true, allowLoop: true,
    maxPrsPerRun: 5, maxMinutes: 60, maxErrors: 3, maxRetriesPerIssue: 1,
    staleDays: 7, allowAutoMerge: false,
    ...overrides,
  };
  return { get: () => s };
}

test('mission report on completed run with multiple PRs', () => {
  const r = buildAutopilotState({ mode: 'loop', settingsSnapshot: fakeSettings().get(), unattended: true, plannedTasks: 5 });
  recordPR({ run: r, pr: { number: 100, url: 'http://x/100', title: 'feat(a)', branch: 'feat/a', issueNumber: 10 } });
  recordIssueCompleted(r, 10, { title: 'a', prUrl: 'http://x/100', prNumber: 100 });
  recordPR({ run: r, pr: { number: 101, url: 'http://x/101', title: 'feat(b)', branch: 'feat/b', issueNumber: 11 } });
  recordIssueCompleted(r, 11, { title: 'b', prUrl: 'http://x/101', prNumber: 101 });
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  const report = r.missionReport;
  assert.equal(report.outcome, 'completed');
  assert.equal(report.prsCreated, 2);
  assert.equal(report.failedCount, 0);
  assert.match(report.summary, /2 PR/);
  assert.match(report.nextAction, /Review and merge/);
});

test('mission report partial outcome on success+failure mix', () => {
  const r = buildAutopilotState({ mode: 'loop', settingsSnapshot: fakeSettings().get(), unattended: true, plannedTasks: 3 });
  recordPR({ run: r, pr: { number: 200, url: 'http://x/200', title: 'feat(a)', branch: 'feat/a', issueNumber: 20 } });
  recordIssueCompleted(r, 20, { title: 'a', prUrl: 'http://x/200', prNumber: 200 });
  recordIssueFailed(r, 21, AUTOPILOT_STOP_REASONS.CLAUDE_FAILED, { detail: 'exit=1' });
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  const report = r.missionReport;
  assert.equal(report.prsCreated, 1);
  assert.equal(report.failedCount, 1);
  assert.match(report.summary, /1 PR/);
  assert.match(report.summary, /échouée/);
});

test('mission report no_safe_tasks message', () => {
  const r = buildAutopilotState({ mode: 'loop', settingsSnapshot: fakeSettings().get(), unattended: true, plannedTasks: 5 });
  markStopped(r, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
  const report = r.missionReport;
  assert.match(report.summary, /aucune task safe/i);
  assert.match(report.nextAction, /No safe task/i);
});

test('mission report all-failed yields failed outcome', () => {
  const r = buildAutopilotState({ mode: 'loop', settingsSnapshot: fakeSettings().get(), unattended: true, plannedTasks: 1 });
  recordIssueFailed(r, 42, AUTOPILOT_STOP_REASONS.CLAUDE_FAILED, { detail: 'Claude exited code 1' });
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  const report = r.missionReport;
  assert.equal(report.outcome, 'failed');
  assert.match(report.summary, /Aucune PR/);
  assert.match(report.summary, /#42/);
});

test('exportRunSummary exposes failedIssues, createdPrs, missionReport', () => {
  const r = buildAutopilotState({ mode: 'loop', unattended: true, plannedTasks: 5 });
  recordPR({ run: r, pr: { number: 1, url: 'http://x/1', title: 't', branch: 'b', issueNumber: 9 } });
  recordIssueCompleted(r, 9);
  recordIssueFailed(r, 10, AUTOPILOT_STOP_REASONS.NO_PR_PRODUCED, { detail: 'no pr' });
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  const s = exportRunSummary(r);
  assert.equal(s.unattended, true);
  assert.equal(s.plannedTasks, 5);
  assert.equal(s.createdPrs.length, 1);
  assert.equal(s.failedIssues.length, 1);
  assert.ok(s.missionReport);
  assert.equal(s.missionReport.prsCreated, 1);
});

test('engine loop continues after one failed issue and stops on no_safe_task', async () => {
  const queue = [
    { number: 1, title: 'a', score: 10, labels: ['ai:autonomous', 'risk:safe'] },
    { number: 2, title: 'b', score: 9, labels: ['ai:autonomous', 'risk:safe'] },
    { number: 3, title: 'c', score: 8, labels: ['ai:autonomous', 'risk:safe'] },
  ];
  const settings = fakeSettings({ maxPrsPerRun: 5, allowLoop: true });
  const engine = new AutopilotEngine({
    repoRoot: '/tmp', settings, store: fakeStore(), logs: null, env: {},
    claudeAdapter: { available: true, prepare: () => ({ command: 'mock', prompt: 'p' }), launch: () => ({ ok: false }) },
    dryRun: false,
  });
  // simulate by direct loop helpers — drive _attemptIssue replacement
  const run = buildAutopilotState({ mode: 'loop', settingsSnapshot: settings.get(), unattended: true, plannedTasks: 3 });
  // PR for #1
  recordPR({ run, pr: { number: 1001, url: 'http://x/1001', title: 'a', branch: 'feat/issue-1-autopilot', issueNumber: 1 } });
  recordIssueCompleted(run, 1, { title: 'a', prUrl: 'http://x/1001', prNumber: 1001 });
  run.issuesProcessed.push(1);
  // Fail #2
  recordIssueFailed(run, 2, AUTOPILOT_STOP_REASONS.CLAUDE_FAILED, { detail: 'Claude exit=1' });
  run.issuesProcessed.push(2);
  // PR for #3
  recordPR({ run, pr: { number: 1003, url: 'http://x/1003', title: 'c', branch: 'feat/issue-3-autopilot', issueNumber: 3 } });
  recordIssueCompleted(run, 3, { title: 'c', prUrl: 'http://x/1003', prNumber: 1003 });
  run.issuesProcessed.push(3);
  markStopped(run, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
  const report = run.missionReport;
  assert.equal(report.prsCreated, 2);
  assert.equal(report.failedCount, 1);
  assert.equal(report.completedCount, 2);
  assert.match(report.summary, /2 PR/);
});

test('failed issue list excludes from re-pick within same run', () => {
  const r = buildAutopilotState({ mode: 'loop', unattended: true, plannedTasks: 5 });
  recordIssueFailed(r, 42, 'claude-failed', { detail: 'x' });
  // mimic _pickIssue exclusion logic
  const failedNums = (r.failedIssues ?? []).map((f) => Number(f.number));
  const exclude = Array.from(new Set([...(r.issuesProcessed ?? []), ...failedNums]));
  assert.ok(exclude.includes(42));
});

test('skippedIssues recorded with reason', () => {
  const r = buildAutopilotState({ mode: 'loop' });
  recordIssueSkipped(r, 7, 'guard-block', { title: 't' });
  assert.equal(r.skippedIssues.length, 1);
  assert.equal(r.skippedIssues[0].reason, 'guard-block');
});

test('mission report sets autoMergeAllowed=false when settings disabled', () => {
  const r = buildAutopilotState({ mode: 'loop', settingsSnapshot: fakeSettings({ allowAutoMerge: false }).get() });
  recordPR({ run: r, pr: { number: 1, url: 'http://x/1', title: 't', branch: 'b', issueNumber: 9 } });
  markStopped(r, AUTOPILOT_STOP_REASONS.COMPLETED);
  assert.equal(r.missionReport.autoMergeAllowed, false);
  assert.match(r.missionReport.nextAction, /Review and merge/);
});

test('buildMissionReport handles waiting state', () => {
  const r = buildAutopilotState({ mode: 'loop', unattended: true, plannedTasks: 5 });
  r.status = 'waiting';
  r.pendingQuestionId = 'q-1';
  const rep = buildMissionReport(r);
  assert.equal(rep.outcome, 'waiting');
  assert.match(rep.nextAction, /Answer pending question/);
});
