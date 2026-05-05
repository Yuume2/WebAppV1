import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const launcher = resolve(__dirname, 'launch.mjs');

function spawnLauncher(args, timeoutMs = 5000) {
  return new Promise((resolveP) => {
    const child = spawn('node', [launcher, ...args], { cwd: repoRoot, env: { ...process.env, NODE_ENV: 'test' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
    const t = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      resolveP({ stdout, stderr, killed: true });
    }, timeoutMs);
    child.on('close', () => { clearTimeout(t); resolveP({ stdout, stderr, killed: false }); });
  });
}

test('launcher boots and prints local URL with token', async () => {
  const r = await spawnLauncher(['--no-open', '--port=8799'], 4000);
  assert.match(r.stdout, /WebAppV1.*Cockpit/);
  assert.match(r.stdout, /http:\/\/127\.0\.0\.1:8799/);
});

test('launcher honors --port', async () => {
  const r = await spawnLauncher(['--no-open', '--port=8801'], 4000);
  assert.match(r.stdout, /:8801/);
});
