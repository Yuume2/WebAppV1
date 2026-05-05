#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const settingsFile = resolve(repoRoot, '.local-control', 'settings.json');

const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const issueArg = args.find((a) => a.startsWith('--issue='));
const mode = modeArg ? modeArg.slice(7) : 'run-one';
const issue = issueArg ? Number(issueArg.slice(8)) : null;

function color(c, s) {
  const map = { red: 31, green: 32, yellow: 33, magenta: 35, cyan: 36, dim: 2 };
  return process.stdout.isTTY ? `\x1b[${map[c] ?? 0}m${s}\x1b[0m` : s;
}

function readSettings() {
  if (!existsSync(settingsFile)) return null;
  try { return JSON.parse(readFileSync(settingsFile, 'utf8')); } catch { return null; }
}

const s = readSettings();
if (!s) {
  console.error(color('red', '✗ no .local-control/settings.json — start `pnpm cockpit` once first'));
  process.exit(2);
}
if (!s.allowExec) {
  console.error(color('red', '✗ allowExec=false in settings — flip it in cockpit Settings before running autopilot'));
  process.exit(3);
}
if (mode === 'loop' && !s.allowLoop) {
  console.error(color('red', '✗ allowLoop=false — autopilot:loop refuses to start'));
  process.exit(3);
}

console.log(color('magenta', `\n  autopilot · mode=${mode} · maxPRs=${s.maxPrsPerRun} · maxMin=${s.maxMinutes}`));
if (issue) console.log(color('cyan', `  → issue forcée : #${issue}`));

const launcher = resolve(__dirname, 'launch.mjs');
const child = spawn('node', [launcher, '--no-open'], {
  cwd: repoRoot,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: process.env,
});

const tok = s.authToken;
if (!tok) {
  console.error(color('red', '✗ no auth token in settings'));
  child.kill('SIGTERM');
  process.exit(4);
}

async function waitHealth(url, attempts = 25) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const base = 'http://127.0.0.1:8787';
const hdrs = { 'authorization': `Bearer ${tok}`, 'content-type': 'application/json' };

setTimeout(async () => {
  const ready = await waitHealth(`${base}/api/health`);
  if (!ready) { console.error(color('red', '✗ server did not start')); child.kill(); process.exit(5); }
  const apMode = mode === 'loop' ? 'loop' : 'exec';
  const body = JSON.stringify({ mode: apMode, issue: issue ?? null });
  const res = await fetch(`${base}/api/autopilot/start`, { method: 'POST', headers: hdrs, body });
  const data = await res.json();
  if (!data.ok) { console.error(color('red', `✗ start refused : ${data.reason}`)); child.kill(); process.exit(6); }
  console.log(color('green', `  ✓ started run ${data.run?.id}`));

  const stop = () => { fetch(`${base}/api/autopilot/stop`, { method: 'POST', headers: hdrs, body: '{}' }).catch(() => {}); setTimeout(() => child.kill('SIGTERM'), 1500); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}, 100);

child.on('close', (code) => process.exit(code ?? 0));
