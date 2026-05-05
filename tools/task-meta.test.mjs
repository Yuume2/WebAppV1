import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTaskMeta,
  renderTaskMeta,
  upsertTaskMeta,
  validateMeta,
  mergeMeta,
} from './task-meta.mjs';

describe('parseTaskMeta', () => {
  it('returns empty object when no block', () => {
    assert.deepEqual(parseTaskMeta(''), {});
    assert.deepEqual(parseTaskMeta('## Goal\nx'), {});
  });

  it('parses scalar fields', () => {
    const body = [
      '## Goal',
      'do',
      '<!-- task-meta v1',
      'estimatedComplexity: M',
      'expectedValidationCommand: pnpm test',
      'acLastVerifiedAt: 2026-05-05T12:00:00Z',
      'acLastVerifiedCommit: abc123',
      '-->',
    ].join('\n');
    const m = parseTaskMeta(body);
    assert.equal(m.estimatedComplexity, 'M');
    assert.equal(m.expectedValidationCommand, 'pnpm test');
    assert.equal(m.acLastVerifiedAt, '2026-05-05T12:00:00Z');
    assert.equal(m.acLastVerifiedCommit, 'abc123');
  });

  it('parses list fields (block form)', () => {
    const body = [
      '<!-- task-meta v1',
      'suspectedFiles:',
      '  - apps/api/src/x.ts',
      '  - apps/web/y.tsx',
      'dependsOn:',
      '  - 12',
      '  - 34',
      '-->',
    ].join('\n');
    const m = parseTaskMeta(body);
    assert.deepEqual(m.suspectedFiles, ['apps/api/src/x.ts', 'apps/web/y.tsx']);
    assert.deepEqual(m.dependsOn, [12, 34]);
  });

  it('parses list fields (inline comma form)', () => {
    const body = [
      '<!-- task-meta v1',
      'dependsOn: 5, #7, 9',
      '-->',
    ].join('\n');
    assert.deepEqual(parseTaskMeta(body).dependsOn, [5, 7, 9]);
  });

  it('ignores unknown keys', () => {
    const body = '<!-- task-meta v1\nrandomKey: whatever\nestimatedComplexity: S\n-->';
    const m = parseTaskMeta(body);
    assert.equal(m.estimatedComplexity, 'S');
    assert.equal(m.randomKey, undefined);
  });
});

describe('validateMeta', () => {
  it('accepts empty meta', () => {
    assert.deepEqual(validateMeta({}), []);
  });

  it('rejects bad complexity', () => {
    const errs = validateMeta({ estimatedComplexity: 'huge' });
    assert.equal(errs.length, 1);
    assert.match(errs[0], /estimatedComplexity/);
  });

  it('rejects bad ISO date', () => {
    const errs = validateMeta({ acLastVerifiedAt: 'yesterday' });
    assert.equal(errs.length, 1);
  });

  it('rejects non-positive dep', () => {
    const errs = validateMeta({ dependsOn: [0, -3] });
    assert.equal(errs.length, 2);
  });

  it('accepts well-formed', () => {
    const errs = validateMeta({
      estimatedComplexity: 'M',
      acLastVerifiedAt: '2026-05-05T00:00:00Z',
      dependsOn: [1, 2],
      suspectedFiles: ['x.ts'],
      blockingCriteria: ['needs key'],
    });
    assert.deepEqual(errs, []);
  });
});

describe('renderTaskMeta', () => {
  it('round-trips parse → render → parse', () => {
    const meta = {
      estimatedComplexity: 'M',
      expectedValidationCommand: 'pnpm test',
      suspectedFiles: ['a.ts', 'b.ts'],
      dependsOn: [1, 2],
    };
    const rendered = renderTaskMeta(meta);
    const parsed = parseTaskMeta(rendered);
    assert.deepEqual(parsed, meta);
  });

  it('omits empty fields', () => {
    const r = renderTaskMeta({ estimatedComplexity: 'S' });
    assert.match(r, /estimatedComplexity: S/);
    assert.doesNotMatch(r, /suspectedFiles/);
  });
});

describe('upsertTaskMeta', () => {
  it('appends block when none exists', () => {
    const result = upsertTaskMeta('## Goal\nx', { estimatedComplexity: 'S' });
    assert.match(result, /## Goal/);
    assert.match(result, /<!-- task-meta v1/);
    assert.equal(parseTaskMeta(result).estimatedComplexity, 'S');
  });

  it('replaces existing block', () => {
    const original = '## Goal\nx\n<!-- task-meta v1\nestimatedComplexity: L\n-->';
    const result = upsertTaskMeta(original, { estimatedComplexity: 'S' });
    assert.equal(parseTaskMeta(result).estimatedComplexity, 'S');
    assert.equal((result.match(/task-meta v1/g) || []).length, 1);
  });

  it('throws on invalid meta', () => {
    assert.throws(() => upsertTaskMeta('', { estimatedComplexity: 'huge' }), /estimatedComplexity/);
  });
});

describe('mergeMeta', () => {
  it('overrides defined keys, preserves others', () => {
    const out = mergeMeta(
      { estimatedComplexity: 'M', acLastVerifiedAt: '2025-01-01T00:00:00Z' },
      { estimatedComplexity: 'L' },
    );
    assert.equal(out.estimatedComplexity, 'L');
    assert.equal(out.acLastVerifiedAt, '2025-01-01T00:00:00Z');
  });

  it('ignores undefined patch values', () => {
    const out = mergeMeta({ estimatedComplexity: 'M' }, { estimatedComplexity: undefined });
    assert.equal(out.estimatedComplexity, 'M');
  });
});
