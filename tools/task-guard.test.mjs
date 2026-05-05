import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDiff } from './task-guard.mjs';

const safeInput = (override = {}) => ({
  files: [{ status: 'M', path: 'apps/web/src/components/Button.tsx' }],
  renames: 0,
  changedLines: 10,
  unified: '+ added\n- removed\n',
  ...override,
});

describe('evaluateDiff — safe paths', () => {
  it('passes for a small UI tweak', () => {
    const r = evaluateDiff(safeInput());
    assert.equal(r.safe, true);
    assert.equal(r.violations.length, 0);
  });

  it('passes for tooling change', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'M', path: 'tools/task-score.mjs' }],
    }));
    assert.equal(r.safe, true);
  });
});

describe('evaluateDiff — hard path rules', () => {
  it('blocks DB migration', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'A', path: 'apps/api/src/db/migrations/0042_add_col.sql' }],
    }));
    assert.equal(r.safe, false);
    assert.ok(r.violations.find((v) => v.id === 'db-migrations'));
  });

  it('blocks DB schema', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'M', path: 'apps/api/src/db/schema.ts' }],
    }));
    assert.ok(r.violations.find((v) => v.id === 'db-schema'));
  });

  it('blocks auth/cipher edits', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'M', path: 'apps/api/src/lib/api-key-cipher.ts' }],
    }));
    assert.ok(r.violations.find((v) => v.id === 'auth-cipher'));
  });

  it('blocks .github/workflows changes', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'M', path: '.github/workflows/ci.yml' }],
    }));
    assert.ok(r.violations.find((v) => v.id === 'workflows'));
  });

  it('blocks docker-compose change', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'M', path: 'docker-compose.yml' }],
    }));
    assert.ok(r.violations.find((v) => v.id === 'docker-infra'));
  });

  it('blocks .env edits', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'M', path: 'apps/api/.env.local' }],
    }));
    assert.ok(r.violations.find((v) => v.id === 'env-files'));
  });

  it('blocks lockfile changes', () => {
    const r = evaluateDiff(safeInput({
      files: [{ status: 'M', path: 'pnpm-lock.yaml' }],
    }));
    assert.ok(r.violations.find((v) => v.id === 'lockfile'));
  });
});

describe('evaluateDiff — soft (count) rules', () => {
  it('blocks too-large diff (lines)', () => {
    const r = evaluateDiff(safeInput({ changedLines: 600 }));
    assert.ok(r.violations.find((v) => v.id === 'large-diff-lines'));
  });

  it('blocks too-many-files diff', () => {
    const files = Array.from({ length: 30 }, (_, i) => ({ status: 'M', path: `apps/web/${i}.tsx` }));
    const r = evaluateDiff(safeInput({ files }));
    assert.ok(r.violations.find((v) => v.id === 'large-diff-files'));
  });

  it('blocks mass renames', () => {
    const r = evaluateDiff(safeInput({ renames: 6 }));
    assert.ok(r.violations.find((v) => v.id === 'mass-renames'));
  });
});

describe('evaluateDiff — content rules', () => {
  it('blocks dependency stanza change in package.json', () => {
    const r = evaluateDiff({
      files: [{ status: 'M', path: 'package.json' }],
      renames: 0,
      changedLines: 5,
      unified: [
        'diff --git a/package.json b/package.json',
        '+++ b/package.json',
        '+  "dependencies": {',
        '+    "lodash": "^4.0.0"',
      ].join('\n'),
    });
    assert.ok(r.violations.find((v) => v.id === 'package-json-deps'));
  });

  it('does not flag package.json scripts-only change', () => {
    const r = evaluateDiff({
      files: [{ status: 'M', path: 'package.json' }],
      renames: 0,
      changedLines: 2,
      unified: '+    "task:next": "node tools/next-task.mjs",\n',
    });
    assert.equal(r.safe, true);
  });
});
