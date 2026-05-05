import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotEnv, evaluateV5Env, readBoolEnv, readIntEnv } from './v5-env.mjs';

test('parseDotEnv ignores comments and trims', () => {
  const env = parseDotEnv('# comment\nFOO=bar\nBAZ="qux"\n\nQUOTED=\'x\'\n');
  assert.equal(env.FOO, 'bar');
  assert.equal(env.BAZ, 'qux');
  assert.equal(env.QUOTED, 'x');
});

test('evaluateV5Env reports missing groups when empty', () => {
  const r = evaluateV5Env({});
  assert.equal(r.requiredOk, false);
  assert.equal(r.notionConfigured, false);
  assert.equal(r.n8nConfigured, false);
  assert.equal(r.whatsappConfigured, false);
  assert.ok(r.missingEnv.includes('CLAUDE_CODE_COMMAND'));
  assert.ok(r.missingEnv.includes('NOTION_TOKEN'));
});

test('evaluateV5Env detects Notion configured when both keys present', () => {
  const r = evaluateV5Env({
    CLAUDE_CODE_COMMAND: 'yu',
    CLAUDE_CODE_MODE: 'cli',
    GITHUB_OWNER: 'x',
    GITHUB_REPO: 'y',
    NOTION_TOKEN: 't',
    NOTION_QUESTIONS_DATABASE_ID: 'd',
  });
  assert.equal(r.requiredOk, true);
  assert.equal(r.notionConfigured, true);
  assert.equal(r.n8nConfigured, false);
});

test('readBoolEnv coerces 1/true/yes/on', () => {
  assert.equal(readBoolEnv({ X: '1' }, 'X'), true);
  assert.equal(readBoolEnv({ X: 'true' }, 'X'), true);
  assert.equal(readBoolEnv({ X: 'no' }, 'X'), false);
  assert.equal(readBoolEnv({}, 'X', true), true);
});

test('readIntEnv falls back when not numeric', () => {
  assert.equal(readIntEnv({ X: '42' }, 'X'), 42);
  assert.equal(readIntEnv({ X: 'oops' }, 'X', 7), 7);
  assert.equal(readIntEnv({}, 'X', 9), 9);
});
