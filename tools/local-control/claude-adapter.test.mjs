import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClaudeCommand, buildIssuePrompt, prepareClaudeRun } from './claude-adapter.mjs';

test('resolveClaudeCommand rejects when not set', () => {
  const r = resolveClaudeCommand({});
  assert.equal(r.ok, false);
});

test('resolveClaudeCommand rejects unsafe characters', () => {
  const r = resolveClaudeCommand({ CLAUDE_CODE_COMMAND: 'yu; rm -rf /' });
  assert.equal(r.ok, false);
});

test('resolveClaudeCommand accepts safe alphanumeric', () => {
  const r = resolveClaudeCommand({ CLAUDE_CODE_COMMAND: 'yu' });
  assert.equal(r.ok, true);
  assert.equal(r.command, 'yu');
});

test('buildIssuePrompt rejects invalid issue', () => {
  assert.throws(() => buildIssuePrompt({ issue: 0, repoRoot: '/x' }));
  assert.throws(() => buildIssuePrompt({ issue: 'abc', repoRoot: '/x' }));
});

test('buildIssuePrompt embeds issue number and respects mode', () => {
  const p = buildIssuePrompt({ issue: 42, mode: 'plan', repoRoot: '/repo' });
  assert.match(p, /#42/);
  assert.match(p, /Mode demandé : plan/);
  assert.match(p, /PLAN-ONLY/);
});

test('prepareClaudeRun returns reason when command missing', () => {
  const r = prepareClaudeRun({ issue: 1, repoRoot: '/repo', env: {} });
  assert.equal(r.ready, false);
  assert.ok(r.prompt.length > 0);
  assert.equal(r.branch, 'feat/issue-1-autopilot');
});

test('prepareClaudeRun ready when CLAUDE_CODE_COMMAND set', () => {
  const r = prepareClaudeRun({ issue: 7, mode: 'exec', repoRoot: '/repo', env: { CLAUDE_CODE_COMMAND: 'yu' } });
  assert.equal(r.ready, true);
  assert.equal(r.command, 'yu');
  assert.equal(r.mode, 'exec');
  assert.deepEqual(r.proposedCommands.slice(0, 2), ['git switch main', 'git pull --ff-only']);
});
