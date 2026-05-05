import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBranchName } from './task-runner.mjs';

describe('deriveBranchName', () => {
  it('handles a frontend feat issue', () => {
    const r = deriveBranchName({
      number: 41,
      title: '[frontend] feat(web): Sentry browser SDK init',
      labels: [
        { name: 'role:frontend' },
        { name: 'type:feat' },
        { name: 'P2-soon' },
      ],
    });
    assert.equal(r, 'feat/web-sentry-browser-sdk-init-#41');
  });

  it('handles a backend chore issue', () => {
    const r = deriveBranchName({
      number: 11,
      title: '[backend] chore(api): setup api environment variables',
      labels: [
        { name: 'role:backend' },
        { name: 'type:chore' },
      ],
    });
    assert.equal(r, 'chore/api-setup-api-environment-variables-#11');
  });

  it('falls back to coord+feat when role/type missing', () => {
    const r = deriveBranchName({
      number: 99,
      title: 'something undefined',
      labels: [],
    });
    assert.match(r, /^feat\/coord-something-undefined-#99$/);
  });

  it('truncates very long titles', () => {
    const r = deriveBranchName({
      number: 1,
      title: '[frontend] feat(web): ' + 'a'.repeat(100),
      labels: [{ name: 'role:frontend' }, { name: 'type:feat' }],
    });
    assert.ok(r.length < 80, `branch too long: ${r}`);
    assert.match(r, /-#1$/);
  });

  it('handles fix type', () => {
    const r = deriveBranchName({
      number: 50,
      title: '[backend] fix(api): null pointer in messages',
      labels: [{ name: 'role:backend' }, { name: 'type:fix' }],
    });
    assert.equal(r, 'fix/api-null-pointer-in-messages-#50');
  });
});
