import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets, isSensitivePath, classifyPaths } from './safety.mjs';

test('redacts GitHub token pattern', () => {
  const out = redactSecrets('token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
  assert.match(out, /\[REDACTED\]/);
  assert.doesNotMatch(out, /ghp_ABCDEF/);
});

test('redacts OpenAI key pattern', () => {
  const out = redactSecrets('key=sk-AAAAAAAAAAAAAAAAAAAA');
  assert.match(out, /\[REDACTED\]/);
});

test('redacts AWS access key', () => {
  const out = redactSecrets('AKIAABCDEFGHIJKLMNOP');
  assert.match(out, /\[REDACTED\]/);
});

test('redacts custom token via extraTokens', () => {
  const tok = 'a'.repeat(64);
  const out = redactSecrets(`auth ${tok} end`, [tok]);
  assert.match(out, /\[REDACTED\]/);
  assert.doesNotMatch(out, /aaaa/);
});

test('skips short extra tokens', () => {
  const out = redactSecrets('hello short', ['ab']);
  assert.equal(out, 'hello short');
});

test('redacts ENV-style secret assignment', () => {
  const out = redactSecrets('MY_SECRET=topsecretvalue');
  assert.match(out, /MY_SECRET=\[REDACTED\]/);
});

test('isSensitivePath flags db migrations and env', () => {
  assert.equal(isSensitivePath('apps/api/db/migrations/0001.sql'), true);
  assert.equal(isSensitivePath('.env'), true);
  assert.equal(isSensitivePath('apps/api/.env.production'), true);
  assert.equal(isSensitivePath('infra/main.tf'), true);
  assert.equal(isSensitivePath('.github/workflows/ci.yml'), true);
  assert.equal(isSensitivePath('package.json'), true);
});

test('isSensitivePath ignores normal source files', () => {
  assert.equal(isSensitivePath('apps/web/src/app/page.tsx'), false);
  assert.equal(isSensitivePath('tools/local-control/server.mjs'), false);
});

test('classifyPaths splits sensitive vs safe', () => {
  const r = classifyPaths(['package.json', 'apps/web/page.tsx', '.env']);
  assert.deepEqual(r.sensitive.sort(), ['.env', 'package.json']);
  assert.deepEqual(r.safe, ['apps/web/page.tsx']);
});
