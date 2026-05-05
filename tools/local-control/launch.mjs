#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces, platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const settingsFile = resolve(repoRoot, '.local-control', 'settings.json');

const args = process.argv.slice(2);
const wantLan = args.includes('--lan');
const noOpen = args.includes('--no-open');
const portArg = args.find((a) => a.startsWith('--port='));
const port = portArg ? Number(portArg.slice(7)) : 8787;

function color(c, s) {
  const codes = { reset: 0, bold: 1, dim: 2, red: 31, green: 32, yellow: 33, magenta: 35, cyan: 36 };
  return process.stdout.isTTY ? `\x1b[${codes[c] ?? 0}m${s}\x1b[0m` : s;
}

function findLanIp() {
  const ifs = networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return null;
}

function readToken() {
  if (!existsSync(settingsFile)) return null;
  try { return JSON.parse(readFileSync(settingsFile, 'utf8')).authToken ?? null; } catch { return null; }
}

function checkPort(p) {
  const r = spawnSync('lsof', ['-ti', `:${p}`], { encoding: 'utf8' });
  return r.stdout.trim().split('\n').filter(Boolean);
}

function killPort(p) {
  const pids = checkPort(p);
  if (!pids.length) return false;
  console.log(color('yellow', `! port ${p} occupé par PID(s) ${pids.join(', ')} — kill...`));
  spawnSync('kill', ['-9', ...pids]);
  return true;
}

function openBrowser(url) {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  try { spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
}

async function waitForServer(url, attempts = 25) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

console.log(color('magenta', color('bold', '\n  WebAppV1 · Local Control Cockpit\n')));

if (checkPort(port).length) killPort(port);

const serverPath = resolve(__dirname, 'server.mjs');
const serverArgs = [serverPath];
if (wantLan) serverArgs.push('--lan');
if (portArg) serverArgs.push(`--port=${port}`);

const child = spawn('node', serverArgs, {
  cwd: repoRoot,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: process.env,
});

const localUrl = `http://127.0.0.1:${port}`;
const lanIp = wantLan ? findLanIp() : null;
const lanUrl = wantLan && lanIp ? `http://${lanIp}:${port}` : null;

const token = readToken();
const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : '';

if (await waitForServer(`${localUrl}/api/health`)) {
  console.log(color('green', `  ✓ serveur prêt`));
  console.log(`  ${color('cyan', '→')} ${color('bold', localUrl + tokenSuffix)}`);
  if (lanUrl) console.log(`  ${color('cyan', '→')} ${color('bold', lanUrl + tokenSuffix)} ${color('dim', '(téléphone)')}`);
  if (!token) console.log(color('yellow', `  ! aucun token trouvé — sera généré au démarrage du serveur`));
  if (!noOpen) {
    openBrowser(localUrl + tokenSuffix);
    console.log(color('dim', `  ouverture du navigateur...`));
  }
  console.log(color('dim', `\n  Ctrl+C pour arrêter\n`));
} else {
  console.log(color('red', '  ✗ serveur ne répond pas, voir logs ci-dessus'));
}

const stop = () => { try { child.kill('SIGTERM'); } catch { /* ignore */ } };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('close', (code) => process.exit(code ?? 0));
