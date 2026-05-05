import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDependsOn } from './task-deps.mjs';

describe('parseDependsOn', () => {
  it('returns empty for empty body', () => {
    assert.deepEqual(parseDependsOn(''), []);
    assert.deepEqual(parseDependsOn(null), []);
  });

  it('parses plain "Depends on: #12, #34"', () => {
    assert.deepEqual(parseDependsOn('Depends on: #12, #34'), [12, 34]);
  });

  it('parses without # prefix', () => {
    assert.deepEqual(parseDependsOn('Depends on: 5, 7'), [5, 7]);
  });

  it('case-insensitive and accepts "Depend on"', () => {
    assert.deepEqual(parseDependsOn('depend on: #1'), [1]);
    assert.deepEqual(parseDependsOn('DEPENDS ON: #2'), [2]);
  });

  it('parses task-meta dependsOn block', () => {
    const body = [
      '## Goal',
      'x',
      '<!-- task-meta v1',
      'estimatedComplexity: M',
      'dependsOn: 11, 22',
      '-->',
    ].join('\n');
    assert.deepEqual(parseDependsOn(body), [11, 22]);
  });

  it('merges plain line and task-meta block, dedupes', () => {
    const body = [
      'Depends on: #3, #4',
      '<!-- task-meta v1',
      'dependsOn: 4, 5',
      '-->',
    ].join('\n');
    assert.deepEqual(parseDependsOn(body), [3, 4, 5]);
  });

  it('ignores noise text', () => {
    assert.deepEqual(parseDependsOn('we depend on luck here'), []);
  });

  it('returns sorted unique numbers', () => {
    assert.deepEqual(parseDependsOn('Depends on: #9, #1, #9, #5'), [1, 5, 9]);
  });
});
