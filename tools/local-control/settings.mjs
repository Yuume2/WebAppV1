import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const DEFAULT_SETTINGS = Object.freeze({
  maxPrsPerRun: 3,
  maxMinutes: 60,
  dryRunDefault: true,
  allowExec: false,
  allowLoop: false,
  allowAutoMerge: false,
  allowedRisk: ['safe'],
  allowedAutonomy: ['autonomous'],
  staleDays: 7,
  preferredIssue: null,
  lanEnabled: false,
});

const VALIDATORS = {
  maxPrsPerRun: (v) => Number.isInteger(v) && v >= 1 && v <= 10,
  maxMinutes: (v) => Number.isInteger(v) && v >= 1 && v <= 240,
  dryRunDefault: (v) => typeof v === 'boolean',
  allowExec: (v) => typeof v === 'boolean',
  allowLoop: (v) => typeof v === 'boolean',
  allowAutoMerge: (v) => typeof v === 'boolean',
  allowedRisk: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
  allowedAutonomy: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
  staleDays: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
  preferredIssue: (v) => v === null || (Number.isInteger(v) && v > 0),
  lanEnabled: (v) => typeof v === 'boolean',
};

export function validatePatch(patch) {
  const errors = [];
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === 'authToken') continue;
    if (!(k in VALIDATORS)) {
      errors.push(`unknown setting: ${k}`);
      continue;
    }
    if (!VALIDATORS[k](v)) {
      errors.push(`invalid value for ${k}`);
      continue;
    }
    clean[k] = v;
  }
  return { errors, clean };
}

export function newToken() {
  return randomBytes(32).toString('hex');
}

export class SettingsStore {
  constructor(rootDir) {
    this.dir = resolve(rootDir, '.local-control');
    this.file = resolve(this.dir, 'settings.json');
    this._cache = null;
  }
  ensureDir() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }
  load() {
    this.ensureDir();
    let raw = null;
    if (existsSync(this.file)) {
      try { raw = JSON.parse(readFileSync(this.file, 'utf8')); } catch { raw = null; }
    }
    let dirty = false;
    if (!raw || typeof raw !== 'object') { raw = {}; dirty = true; }
    if (typeof raw.authToken !== 'string' || raw.authToken.length < 32) {
      raw.authToken = newToken();
      dirty = true;
    }
    const merged = { ...DEFAULT_SETTINGS, ...raw };
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (!VALIDATORS[k](merged[k])) {
        merged[k] = DEFAULT_SETTINGS[k];
        dirty = true;
      }
    }
    merged.authToken = raw.authToken;
    if (dirty) this._writeRaw(merged);
    this._cache = merged;
    return merged;
  }
  get() { return this._cache ?? this.load(); }
  patch(p) {
    const { errors, clean } = validatePatch(p);
    if (errors.length) throw new Error(`invalid settings: ${errors.join('; ')}`);
    const cur = this.get();
    const next = { ...cur, ...clean };
    this._writeRaw(next);
    this._cache = next;
    return next;
  }
  redactedCopy() {
    const s = { ...this.get() };
    delete s.authToken;
    return s;
  }
  _writeRaw(obj) {
    this.ensureDir();
    writeFileSync(this.file, JSON.stringify(obj, null, 2));
    try { chmodSync(this.file, 0o600); } catch { /* best-effort */ }
  }
}
