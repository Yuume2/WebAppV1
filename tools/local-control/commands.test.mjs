import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommand, listCommands, COMMANDS } from './commands.mjs';

test('rejects non-whitelisted command', () => {
  const r = resolveCommand('rm', ['-rf', '/']);
  assert.ok(r.error);
});

test('resolves task:doctor with no extra args', () => {
  const r = resolveCommand('task:doctor', []);
  assert.equal(r.bin, 'pnpm');
  assert.deepEqual(r.args, ['task:doctor']);
});

test('rejects extra args for argless command', () => {
  const r = resolveCommand('task:doctor', ['--evil']);
  assert.ok(r.error);
});

test('task:run:plan requires issue arg', () => {
  const r = resolveCommand('task:run:plan', []);
  assert.ok(r.error);
});

test('task:run:plan accepts numeric issue', () => {
  const r = resolveCommand('task:run:plan', ['42']);
  assert.deepEqual(r.args, ['task:run', '--plan-only', '--issue=42']);
});

test('task:run:plan accepts --issue=N', () => {
  const r = resolveCommand('task:run:plan', ['--issue=7']);
  assert.deepEqual(r.args, ['task:run', '--plan-only', '--issue=7']);
});

test('task:run:plan rejects non-issue arg', () => {
  const r = resolveCommand('task:run:plan', ['--exec']);
  assert.ok(r.error);
});

test('task:run:plan rejects shell metacharacters', () => {
  const r = resolveCommand('task:run:plan', ['; rm -rf /']);
  assert.ok(r.error);
});

test('git:status uses fixed args', () => {
  const r = resolveCommand('git:status', []);
  assert.equal(r.bin, 'git');
  assert.deepEqual(r.args, ['status', '--short']);
});

test('listCommands matches COMMANDS keys', () => {
  assert.deepEqual(listCommands().sort(), Object.keys(COMMANDS).sort());
});

test('all whitelist entries use pnpm or git', () => {
  for (const name of listCommands()) {
    assert.ok(['pnpm', 'git'].includes(COMMANDS[name].bin), `unsafe bin in ${name}`);
  }
});
