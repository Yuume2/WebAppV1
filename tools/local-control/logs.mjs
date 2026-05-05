import { existsSync, mkdirSync, createWriteStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class LogStore {
  constructor(rootDir) {
    this.dir = resolve(rootDir, '.local-control', 'logs');
    this.streams = new Map();
    this.history = new Map();
  }
  ensureDir() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }
  open(runId) {
    this.ensureDir();
    const path = resolve(this.dir, `${runId}.log`);
    const s = createWriteStream(path, { flags: 'a' });
    this.streams.set(runId, s);
    this.history.set(runId, []);
    return s;
  }
  append(runId, stream, chunk) {
    const arr = this.history.get(runId);
    if (arr) {
      arr.push({ stream, chunk });
      if (arr.length > 5000) arr.splice(0, arr.length - 5000);
    }
    const s = this.streams.get(runId);
    if (s && !s.destroyed) {
      try { s.write(`[${stream}] ${chunk}`); } catch { /* ignore */ }
    }
  }
  close(runId) {
    const s = this.streams.get(runId);
    if (s) { try { s.end(); } catch { /* ignore */ } }
    this.streams.delete(runId);
  }
  getHistory(runId) {
    if (this.history.has(runId)) return this.history.get(runId);
    const path = resolve(this.dir, `${runId}.log`);
    if (!existsSync(path)) return [];
    const txt = readFileSync(path, 'utf8');
    return txt.split('\n').filter(Boolean).map((line) => {
      const m = line.match(/^\[(stdout|stderr)\]\s?(.*)$/);
      if (m) return { stream: m[1], chunk: m[2] + '\n' };
      return { stream: 'stdout', chunk: line + '\n' };
    });
  }
}

export class StateStore {
  constructor() {
    this.runs = new Map();
    this.subs = new Map();
  }
  createRun({ id, name, args, kind }) {
    const r = { id, name, args, kind, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null };
    this.runs.set(id, r);
    return r;
  }
  finishRun(id, exitCode) {
    const r = this.runs.get(id);
    if (!r) return null;
    r.finishedAt = new Date().toISOString();
    r.exitCode = exitCode;
    return r;
  }
  list(limit = 50) {
    return Array.from(this.runs.values())
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, limit);
  }
  get(id) { return this.runs.get(id) ?? null; }
  subscribe(runId, fn) {
    let set = this.subs.get(runId);
    if (!set) { set = new Set(); this.subs.set(runId, set); }
    set.add(fn);
    return () => { set.delete(fn); if (!set.size) this.subs.delete(runId); };
  }
  emit(runId, event, payload) {
    const set = this.subs.get(runId);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(event, payload); } catch { /* ignore */ }
    }
  }
}
