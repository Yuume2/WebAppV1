import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgsFrom, ArgsError } from './issue-status.mjs';

test('positional: <issueNumber> <status>', () => {
  assert.deepEqual(parseArgsFrom(['21', 'In Progress']), {
    issueNumber: 21,
    status: 'In Progress',
  });
});

test('flag: --status "In Progress" <issueNumber>', () => {
  assert.deepEqual(parseArgsFrom(['--status', 'In Progress', '21']), {
    issueNumber: 21,
    status: 'In Progress',
  });
});

test('flag: <issueNumber> --status Review', () => {
  assert.deepEqual(parseArgsFrom(['21', '--status', 'Review']), {
    issueNumber: 21,
    status: 'Review',
  });
});

test('positional joins multi-word status', () => {
  assert.deepEqual(parseArgsFrom(['42', 'In', 'Progress']), {
    issueNumber: 42,
    status: 'In Progress',
  });
});

test('error: first arg is a status keyword — hint points to right ordering', () => {
  assert.throws(
    () => parseArgsFrom(['in-progress', '21']),
    (err) => {
      assert.ok(err instanceof ArgsError);
      assert.match(err.message, /invalid issue number: "in-progress"/);
      assert.match(err.message, /usage: node tools\/issue-status\.mjs <issueNumber> <status>/);
      return true;
    },
  );
});

test('error: invalid status', () => {
  assert.throws(
    () => parseArgsFrom(['21', 'Bogus']),
    (err) => err instanceof ArgsError && /invalid status: "Bogus"/.test(err.message),
  );
});

test('error: unknown flag', () => {
  assert.throws(
    () => parseArgsFrom(['--wat', '21', 'Review']),
    (err) => err instanceof ArgsError && /unknown flag: --wat/.test(err.message),
  );
});

test('error: missing args shows usage', () => {
  assert.throws(
    () => parseArgsFrom([]),
    (err) => err instanceof ArgsError && err.showUsage === true && err.exitCode === 2,
  );
});
