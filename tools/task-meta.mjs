#!/usr/bin/env node
import { readFileSync } from 'node:fs';

// task-meta v1 — structured metadata embedded in a GitHub issue body.
// Stored as an HTML comment so it stays invisible in rendered Markdown but
// is parseable by tooling.
//
// Canonical shape:
//
// <!-- task-meta v1
// estimatedComplexity: S | M | L | XL
// suspectedFiles:
//   - apps/api/src/routes/messages.ts
//   - apps/web/src/features/chat/index.tsx
// expectedValidationCommand: pnpm --filter @webapp/api test
// acLastVerifiedAt: 2026-05-05T12:00:00Z
// acLastVerifiedCommit: a2e4744
// dependsOn:
//   - 12
//   - 34
// blockingCriteria:
//   - Human decision required for billing flow
// -->
//
// The parser is forgiving: missing fields are simply absent from the result.
// The writer is deterministic: same input → same output bytes.

export const TASK_META_OPEN = '<!-- task-meta v1';
export const TASK_META_CLOSE = '-->';
export const VALID_COMPLEXITY = new Set(['S', 'M', 'L', 'XL']);

const SCALAR_FIELDS = [
  'estimatedComplexity',
  'expectedValidationCommand',
  'acLastVerifiedAt',
  'acLastVerifiedCommit',
];
const LIST_FIELDS = ['suspectedFiles', 'dependsOn', 'blockingCriteria'];

export function extractMetaBlock(body) {
  if (!body) return null;
  const open = body.indexOf(TASK_META_OPEN);
  if (open === -1) return null;
  const close = body.indexOf(TASK_META_CLOSE, open + TASK_META_OPEN.length);
  if (close === -1) return null;
  return {
    start: open,
    end: close + TASK_META_CLOSE.length,
    inner: body.slice(open + TASK_META_OPEN.length, close),
  };
}

export function parseTaskMeta(body) {
  const block = extractMetaBlock(body);
  if (!block) return {};
  const lines = block.inner.split('\n');
  const meta = {};
  let currentList = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) { currentList = null; continue; }

    const listItem = line.match(/^[ \t]+-\s+(.*?)\s*$/);
    if (listItem && currentList) {
      meta[currentList].push(coerce(currentList, listItem[1]));
      continue;
    }

    const kv = line.match(/^([a-zA-Z][\w]*)\s*:\s*(.*?)\s*$/);
    if (kv) {
      const key = kv[1];
      const value = kv[2];
      if (LIST_FIELDS.includes(key)) {
        meta[key] = [];
        if (value !== '') {
          for (const part of value.split(',').map((s) => s.trim()).filter(Boolean)) {
            meta[key].push(coerce(key, part));
          }
        }
        currentList = meta[key].length === 0 ? key : null;
        continue;
      }
      if (SCALAR_FIELDS.includes(key)) {
        meta[key] = value;
        currentList = null;
        continue;
      }
    }
    currentList = null;
  }

  return meta;
}

function coerce(field, raw) {
  if (field === 'dependsOn') {
    const m = raw.match(/#?(\d+)/);
    return m ? Number(m[1]) : raw;
  }
  return raw;
}

export function validateMeta(meta) {
  const errors = [];
  if (meta.estimatedComplexity !== undefined && !VALID_COMPLEXITY.has(meta.estimatedComplexity)) {
    errors.push(`estimatedComplexity must be one of ${[...VALID_COMPLEXITY].join('|')}, got "${meta.estimatedComplexity}"`);
  }
  if (meta.acLastVerifiedAt !== undefined && Number.isNaN(Date.parse(meta.acLastVerifiedAt))) {
    errors.push(`acLastVerifiedAt is not a valid ISO date: "${meta.acLastVerifiedAt}"`);
  }
  if (meta.dependsOn !== undefined) {
    if (!Array.isArray(meta.dependsOn)) errors.push('dependsOn must be a list');
    else for (const d of meta.dependsOn) {
      if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
        errors.push(`dependsOn entry must be a positive integer, got ${JSON.stringify(d)}`);
      }
    }
  }
  for (const f of ['suspectedFiles', 'blockingCriteria']) {
    if (meta[f] !== undefined && !Array.isArray(meta[f])) errors.push(`${f} must be a list`);
  }
  return errors;
}

export function renderTaskMeta(meta) {
  const out = [TASK_META_OPEN];
  for (const f of SCALAR_FIELDS) {
    if (meta[f] !== undefined && meta[f] !== '') out.push(`${f}: ${meta[f]}`);
  }
  for (const f of LIST_FIELDS) {
    const v = meta[f];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out.push(`${f}:`);
    for (const item of v) out.push(`  - ${item}`);
  }
  out.push(TASK_META_CLOSE);
  return out.join('\n');
}

export function upsertTaskMeta(body, meta) {
  const errors = validateMeta(meta);
  if (errors.length) {
    const e = new Error(`invalid task-meta: ${errors.join('; ')}`);
    e.errors = errors;
    throw e;
  }
  const rendered = renderTaskMeta(meta);
  const existing = extractMetaBlock(body || '');
  if (!existing) {
    const sep = body && body.length ? '\n\n' : '';
    return `${body ?? ''}${sep}${rendered}\n`;
  }
  return body.slice(0, existing.start) + rendered + body.slice(existing.end);
}

export function mergeMeta(existing, patch) {
  const merged = { ...existing };
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) continue;
    merged[k] = patch[k];
  }
  return merged;
}

// CLI: read body from stdin or --file, parse, print JSON. Or write a patch.
function main() {
  const args = process.argv.slice(2);
  const fileArg = (() => {
    const i = args.findIndex((a) => a === '--file' || a === '-f');
    return i !== -1 ? args[i + 1] : null;
  })();
  const json = args.includes('--json');

  const body = fileArg ? readFileSync(fileArg, 'utf8') : readFileSync(0, 'utf8');
  const meta = parseTaskMeta(body);
  const errors = validateMeta(meta);

  if (json) {
    console.log(JSON.stringify({ meta, errors }, null, 2));
    return;
  }
  if (Object.keys(meta).length === 0) {
    console.log('no task-meta block found.');
    process.exit(2);
  }
  console.log('parsed task-meta:');
  for (const [k, v] of Object.entries(meta)) {
    console.log(`  ${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
  }
  if (errors.length) {
    console.error('\nvalidation errors:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(3);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
