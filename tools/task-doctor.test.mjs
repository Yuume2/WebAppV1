import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPhase3Secrets, rulesetTargetsMain } from './task-doctor.mjs';

describe('checkPhase3Secrets', () => {
  it('reports n/a when no env present', () => {
    const r = checkPhase3Secrets({});
    assert.equal(r.status, 'n/a');
  });

  it('reports warn on partial env', () => {
    const r = checkPhase3Secrets({ NOTION_TOKEN: 'x' });
    assert.equal(r.status, 'warn');
    assert.match(r.detail, /missing/);
  });

  it('reports ok when all env present', () => {
    const r = checkPhase3Secrets({ NOTION_TOKEN: 'x', NOTION_QUESTIONS_DATABASE_ID: 'y' });
    assert.equal(r.status, 'ok');
  });
});

describe('rulesetTargetsMain', () => {
  const base = {
    enforcement: 'active',
    target: 'branch',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  };

  it('matches active ruleset on default branch', () => {
    assert.equal(rulesetTargetsMain(base), true);
  });

  it('matches when include is refs/heads/main', () => {
    assert.equal(rulesetTargetsMain({
      ...base,
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    }), true);
  });

  it('matches when include is ~ALL', () => {
    assert.equal(rulesetTargetsMain({
      ...base,
      conditions: { ref_name: { include: ['~ALL'], exclude: [] } },
    }), true);
  });

  it('rejects disabled enforcement', () => {
    assert.equal(rulesetTargetsMain({ ...base, enforcement: 'disabled' }), false);
    assert.equal(rulesetTargetsMain({ ...base, enforcement: 'evaluate' }), false);
  });

  it('rejects non-branch target', () => {
    assert.equal(rulesetTargetsMain({ ...base, target: 'tag' }), false);
  });

  it('rejects when main is explicitly excluded', () => {
    assert.equal(rulesetTargetsMain({
      ...base,
      conditions: { ref_name: { include: ['~ALL'], exclude: ['refs/heads/main'] } },
    }), false);
  });

  it('rejects unrelated branches', () => {
    assert.equal(rulesetTargetsMain({
      ...base,
      conditions: { ref_name: { include: ['refs/heads/release/*'], exclude: [] } },
    }), false);
  });

  it('rejects null and missing fields safely', () => {
    assert.equal(rulesetTargetsMain(null), false);
    assert.equal(rulesetTargetsMain({}), false);
    assert.equal(rulesetTargetsMain({ enforcement: 'active', target: 'branch' }), false);
  });
});
