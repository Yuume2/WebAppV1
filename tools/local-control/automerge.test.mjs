import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAutoMerge } from './automerge.mjs';

const goodSettings = { allowAutoMerge: true };
const goodPr = {
  state: 'OPEN',
  isDraft: false,
  statusCheckRollup: [{ conclusion: 'SUCCESS', status: 'COMPLETED' }],
  closingIssuesReferences: [{ number: 42 }],
  files: [{ path: 'apps/web/src/foo.tsx' }],
  additions: 30, deletions: 5,
  headRefName: 'feat/foo', baseRefName: 'main',
  reviews: [{ state: 'APPROVED' }],
};
const goodLabels = { labels: [{ name: 'ai:autonomous' }, { name: 'risk:safe' }] };
const goodProtection = { protected: true };
const goodGuard = { allow: true };

test('all-good PR is eligible', () => {
  const r = evaluateAutoMerge({
    pr: 1, settings: goodSettings, prData: goodPr,
    issueLabels: goodLabels, branchProtection: goodProtection, guardResult: goodGuard,
  });
  assert.equal(r.eligible, true);
  assert.deepEqual(r.reasons, []);
});

test('refuses if allowAutoMerge disabled', () => {
  const r = evaluateAutoMerge({
    pr: 1, settings: { allowAutoMerge: false }, prData: goodPr,
    issueLabels: goodLabels, branchProtection: goodProtection, guardResult: goodGuard,
  });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /allowAutoMerge/.test(s)));
});

test('refuses if CI failed', () => {
  const pr = { ...goodPr, statusCheckRollup: [{ conclusion: 'FAILURE' }] };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: pr, issueLabels: goodLabels, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /CI not green/.test(s)));
});

test('refuses if no linked issue', () => {
  const pr = { ...goodPr, closingIssuesReferences: [] };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: pr, issueLabels: null, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /no linked issue/.test(s)));
});

test('refuses if missing ai:autonomous label', () => {
  const labels = { labels: [{ name: 'risk:safe' }] };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: goodPr, issueLabels: labels, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /ai:autonomous/.test(s)));
});

test('refuses if missing risk:safe label', () => {
  const labels = { labels: [{ name: 'ai:autonomous' }] };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: goodPr, issueLabels: labels, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /risk:safe/.test(s)));
});

test('refuses if branch protection missing', () => {
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: goodPr, issueLabels: goodLabels, branchProtection: { protected: false }, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /branch protection/.test(s)));
});

test('refuses if task-guard blocks', () => {
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: goodPr, issueLabels: goodLabels, branchProtection: goodProtection, guardResult: { allow: false } });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /task-guard/.test(s)));
});

test('refuses if diff is large', () => {
  const pr = { ...goodPr, additions: 500, deletions: 100 };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: pr, issueLabels: goodLabels, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /diff too large/.test(s)));
});

test('refuses if sensitive path touched', () => {
  const pr = { ...goodPr, files: [{ path: 'apps/api/db/migrations/0001.sql' }] };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: pr, issueLabels: goodLabels, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /sensitive paths/.test(s)));
});

test('refuses if changes requested', () => {
  const pr = { ...goodPr, reviews: [{ state: 'CHANGES_REQUESTED' }] };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: pr, issueLabels: goodLabels, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /requested changes/.test(s)));
});

test('refuses draft PR', () => {
  const pr = { ...goodPr, isDraft: true };
  const r = evaluateAutoMerge({ pr: 1, settings: goodSettings, prData: pr, issueLabels: goodLabels, branchProtection: goodProtection, guardResult: goodGuard });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((s) => /draft/.test(s)));
});
