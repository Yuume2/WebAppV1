import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { redactSecrets } from './safety.mjs';

export class Runner {
  constructor({ logs, state, settings, repoRoot }) {
    this.logs = logs;
    this.state = state;
    this.settings = settings;
    this.repoRoot = repoRoot;
    this.active = new Map();
  }
  hasActive() { return this.active.size > 0; }
  activeIds() { return Array.from(this.active.keys()); }

  start({ name, args, bin, kind }) {
    const id = randomUUID();
    this.state.createRun({ id, name, args, kind });
    this.logs.open(id);

    const child = spawn(bin, args, {
      cwd: this.repoRoot,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.active.set(id, child);

    const tok = this.settings.get().authToken;
    const onChunk = (stream) => (buf) => {
      const safe = redactSecrets(buf.toString('utf8'), [tok]);
      this.logs.append(id, stream, safe);
      this.state.emit(id, 'log', { runId: id, stream, chunk: safe });
    };
    child.stdout.on('data', onChunk('stdout'));
    child.stderr.on('data', onChunk('stderr'));

    child.on('error', (err) => {
      const msg = redactSecrets(`spawn error: ${err.message}\n`, [tok]);
      this.logs.append(id, 'stderr', msg);
      this.state.emit(id, 'log', { runId: id, stream: 'stderr', chunk: msg });
    });

    child.on('close', (code) => {
      this.active.delete(id);
      this.state.finishRun(id, code);
      this.logs.close(id);
      this.state.emit(id, 'exit', { runId: id, code });
    });

    return id;
  }

  stop(runId) {
    const child = this.active.get(runId);
    if (!child) return false;
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    setTimeout(() => {
      const c = this.active.get(runId);
      if (c) { try { c.kill('SIGKILL'); } catch { /* ignore */ } }
    }, 3000).unref();
    return true;
  }
}
