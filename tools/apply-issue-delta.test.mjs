import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lintIssueBody } from './apply-issue-delta.mjs';

describe('lintIssueBody', () => {
  it('returns empty array when all required sections present', () => {
    const body = [
      '## Goal',
      'do thing',
      '## Acceptance criteria',
      '- [ ] x',
      '## Out of scope',
      'nothing',
    ].join('\n');
    assert.deepEqual(lintIssueBody(body), []);
  });

  it('flags missing Goal', () => {
    const body = '## Acceptance criteria\n- [ ] x\n## Out of scope\nn/a';
    assert.deepEqual(lintIssueBody(body), ['## Goal']);
  });

  it('flags all three when body empty', () => {
    assert.deepEqual(lintIssueBody(''), [
      '## Goal',
      '## Acceptance criteria',
      '## Out of scope',
    ]);
  });

  it('flags missing Out of scope only', () => {
    const body = '## Goal\nx\n## Acceptance criteria\n- [ ] y';
    assert.deepEqual(lintIssueBody(body), ['## Out of scope']);
  });

  it('treats sections as substring match (case sensitive)', () => {
    const body = '## goal\nx\n## acceptance criteria\ny\n## out of scope\nz';
    assert.deepEqual(lintIssueBody(body), [
      '## Goal',
      '## Acceptance criteria',
      '## Out of scope',
    ]);
  });
});
