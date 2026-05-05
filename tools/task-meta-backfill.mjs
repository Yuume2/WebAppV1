#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTaskMeta, upsertTaskMeta, mergeMeta } from './task-meta.mjs';

// Backfills a minimal task-meta v1 block on every open issue that lacks one.
// Default mode: DRY-RUN. Prints diffs but does not write.
// To actually patch issue bodies on GitHub, pass --yes (and --confirm "I MEAN IT").
//
// Conservative defaults applied:
//   acLastVerifiedAt = now (ISO)
//   acLastVerifiedCommit = current main HEAD short sha
//   estimatedComplexity = NOT set (humans must classify; placeholder is misleading)
//
// Existing meta blocks are NEVER overwritten — issues with a block are skipped.

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function die(msg) { console.error(c.red(`error: ${msg}`)); process.exit(1); }

function run(bin, argv) {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function ghJson(args) {
  const r = run('gh', args);
  if (r.code !== 0) die(`gh ${args.join(' ')}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function gitHead() {
  const r = run('git', ['rev-parse', '--short', 'HEAD']);
  return r.code === 0 ? r.stdout.trim() : null;
}

function patchIssueBody(number, newBody) {
  const tmp = mkdtempSync(join(tmpdir(), 'taskmeta-'));
  const file = join(tmp, 'body.md');
  writeFileSync(file, newBody);
  const r = run('gh', ['issue', 'edit', String(number), '--body-file', file]);
  rmSync(tmp, { recursive: true, force: true });
  return { ok: r.code === 0, err: r.stderr || r.stdout };
}

function main() {
  const args = process.argv.slice(2);
  const YES = args.includes('--yes');
  const CONFIRMED = args.includes('--confirm') && args[args.indexOf('--confirm') + 1] === 'I MEAN IT';
  const FORCE = args.includes('--force-overwrite');

  if (YES && !CONFIRMED) die('apply mode requires both --yes and --confirm "I MEAN IT"');

  const issues = ghJson([
    'issue', 'list',
    '--state', 'open',
    '--limit', '200',
    '--json', 'number,title,body,url',
  ]);

  const head = gitHead();
  const now = new Date().toISOString();
  const verifiedAt = now.replace(/\.\d{3}Z$/, 'Z');

  const targets = [];
  const skipped = [];

  for (const it of issues) {
    const existing = parseTaskMeta(it.body || '');
    const hasMeta = Object.keys(existing).length > 0;
    if (hasMeta && !FORCE) {
      skipped.push({ ...it, reason: 'already has task-meta block' });
      continue;
    }
    const patch = {
      acLastVerifiedAt: verifiedAt,
      ...(head ? { acLastVerifiedCommit: head } : {}),
    };
    const merged = mergeMeta(existing, patch);
    const newBody = upsertTaskMeta(it.body || '', merged);
    targets.push({ ...it, oldBody: it.body || '', newBody, patch });
  }

  console.log(c.bold(`\n=== task-meta backfill ===`));
  console.log(c.cyan(`mode:           ${YES ? 'APPLY (writes to GitHub)' : 'DRY-RUN (no writes)'}`));
  console.log(c.cyan(`open issues:    ${issues.length}`));
  console.log(c.cyan(`to patch:       ${targets.length}`));
  console.log(c.cyan(`skipped:        ${skipped.length}`));
  console.log(c.cyan(`commit anchor:  ${head ?? '(unknown)'}`));
  console.log(c.cyan(`verified at:    ${verifiedAt}`));
  console.log('');

  for (const t of targets) {
    console.log(`${c.green('+')} #${t.number} — ${t.title}`);
    console.log(c.dim(`   url: ${t.url}`));
    console.log(c.dim(`   patch: ${JSON.stringify(t.patch)}`));
  }
  for (const s of skipped) {
    console.log(`${c.dim('=')} #${s.number} — ${s.title} ${c.dim(`(${s.reason})`)}`);
  }

  if (!YES) {
    console.log('');
    console.log(c.yellow('dry-run complete. no GitHub writes.'));
    console.log(c.dim('to apply: pnpm task:meta:backfill -- --yes --confirm "I MEAN IT"'));
    return;
  }

  console.log('');
  let ok = 0, fail = 0;
  for (const t of targets) {
    process.stdout.write(`patching #${t.number} ... `);
    const r = patchIssueBody(t.number, t.newBody);
    if (r.ok) { console.log(c.green('OK')); ok++; }
    else      { console.log(c.red('FAIL')); console.error(c.red(`  ${r.err.trim()}`)); fail++; }
  }
  console.log('');
  console.log(c.cyan(`patched: ${ok}  failed: ${fail}`));
  if (fail > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
