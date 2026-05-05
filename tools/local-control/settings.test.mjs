import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { SettingsStore, validatePatch, DEFAULT_SETTINGS } from './settings.mjs';

function mkroot() { return mkdtempSync(resolve(tmpdir(), 'lc-settings-')); }

test('load creates settings file with auth token if missing', () => {
  const root = mkroot();
  try {
    const s = new SettingsStore(root);
    const v = s.load();
    assert.equal(typeof v.authToken, 'string');
    assert.ok(v.authToken.length >= 32);
    assert.equal(v.allowExec, false);
    assert.equal(v.allowAutoMerge, false);
    const path = resolve(root, '.local-control/settings.json');
    assert.ok(existsSync(path));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('redactedCopy never includes authToken', () => {
  const root = mkroot();
  try {
    const s = new SettingsStore(root); s.load();
    const r = s.redactedCopy();
    assert.equal(r.authToken, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('patch validates and merges', () => {
  const root = mkroot();
  try {
    const s = new SettingsStore(root); s.load();
    const next = s.patch({ maxPrsPerRun: 5, allowExec: true });
    assert.equal(next.maxPrsPerRun, 5);
    assert.equal(next.allowExec, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('patch rejects unknown key', () => {
  const root = mkroot();
  try {
    const s = new SettingsStore(root); s.load();
    assert.throws(() => s.patch({ wat: 1 }), /unknown setting/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('patch rejects authToken update via patch', () => {
  const root = mkroot();
  try {
    const s = new SettingsStore(root); s.load();
    const before = s.get().authToken;
    s.patch({ authToken: 'leaked' });
    assert.equal(s.get().authToken, before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('patch rejects out-of-range maxPrsPerRun', () => {
  const root = mkroot();
  try {
    const s = new SettingsStore(root); s.load();
    assert.throws(() => s.patch({ maxPrsPerRun: 999 }), /invalid value/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('validatePatch returns clean and errors', () => {
  const r = validatePatch({ maxMinutes: 30, allowLoop: 'nope' });
  assert.deepEqual(r.clean, { maxMinutes: 30 });
  assert.equal(r.errors.length, 1);
});

test('DEFAULT_SETTINGS lock the secure defaults', () => {
  assert.equal(DEFAULT_SETTINGS.allowExec, false);
  assert.equal(DEFAULT_SETTINGS.allowAutoMerge, false);
  assert.equal(DEFAULT_SETTINGS.allowLoop, false);
  assert.equal(DEFAULT_SETTINGS.lanEnabled, false);
  assert.equal(DEFAULT_SETTINGS.dryRunDefault, true);
});
