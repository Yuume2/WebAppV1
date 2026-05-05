import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { summarizeDoctor } from './doctor.mjs';

test('summarizeDoctor returns ok when all checks pass', () => {
  const r = summarizeDoctor({
    generatedAt: '2026-05-05T20:00:00Z',
    local: { scripts: { status: 'ok', detail: 'ok' }, packageScripts: { status: 'ok', detail: 'ok' }, docs: { status: 'ok', detail: 'ok' }, git: { branch: 'main', dirtyCount: 0, ahead: 0 } },
    github: { auth: { status: 'ok', detail: '' }, branchProtection: { status: 'ok', detail: 'protected' }, openIssuesMeta: { status: 'ok', detail: '' }, pendingQuestions: { status: 'ok', detail: '' } },
    runtime: { guard: { status: 'ok', detail: '' }, phase3Secrets: { status: 'n/a', detail: '' } },
    gates: { phase2: { ready: true, blockers: [] }, phase3: { ready: false, blockers: ['no notion'] }, phase4: { ready: false, blockers: ['x'] } },
  });
  assert.equal(r.ok, true);
  assert.equal(r.failed.length, 0);
  assert.equal(r.phaseSummary.phase2.ready, true);
  assert.equal(r.phaseSummary.phase3.ready, false);
});

test('summarizeDoctor flags failed checks', () => {
  const r = summarizeDoctor({
    local: { scripts: { status: 'fail', detail: 'missing' }, packageScripts: { status: 'ok' }, docs: { status: 'ok' }, git: { dirtyCount: 0 } },
    github: { auth: { status: 'ok' }, branchProtection: { status: 'fail', detail: 'off' }, openIssuesMeta: { status: 'ok' }, pendingQuestions: { status: 'ok' } },
    runtime: { guard: { status: 'ok' } },
    gates: {},
  });
  assert.equal(r.ok, false);
  assert.ok(r.failed.length >= 2);
});

test('summarizeDoctor surfaces dirty count in branch detail', () => {
  const r = summarizeDoctor({
    local: { git: { branch: 'feat/x', dirtyCount: 3, ahead: 1 }, scripts: { status: 'ok' }, packageScripts: { status: 'ok' }, docs: { status: 'ok' } },
    github: {}, runtime: {}, gates: {},
  });
  const branch = r.checks.find((c) => c.id === 'git');
  assert.match(branch.detail, /3 dirty/);
});
