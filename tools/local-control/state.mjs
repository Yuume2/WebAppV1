import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const RUN_ID_RE = /^[A-Za-z0-9_-]+$/;

export class V5StateStore {
  constructor(repoRoot) {
    this.dir = resolve(repoRoot, '.local-control', 'runs');
    this._ensure();
  }
  _ensure() { if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true }); }
  _path(id) {
    if (!RUN_ID_RE.test(id)) throw new Error('invalid runId');
    return join(this.dir, `${id}.json`);
  }
  newId() { return randomUUID(); }

  save(record) {
    this._ensure();
    if (!record?.id || !RUN_ID_RE.test(record.id)) throw new Error('invalid runId');
    const file = this._path(record.id);
    const data = { ...record, updatedAt: new Date().toISOString() };
    writeFileSync(file, JSON.stringify(data, null, 2));
    try { chmodSync(file, 0o600); } catch { /* best-effort */ }
    return data;
  }
  load(id) {
    const file = this._path(id);
    if (!existsSync(file)) return null;
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
  }
  list({ limit = 30 } = {}) {
    this._ensure();
    const items = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try { items.push(JSON.parse(readFileSync(join(this.dir, name), 'utf8'))); } catch { /* skip */ }
    }
    items.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
    return items.slice(0, limit);
  }
  latest() { return this.list({ limit: 1 })[0] ?? null; }
}
