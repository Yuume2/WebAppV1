import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPhase3Secrets } from './task-doctor.mjs';

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
