#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const STALE_DAYS = 14;

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function die(msg) { console.error(c.red(`error: ${msg}`)); process.exit(1); }

function ghJson(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) die(`gh ${args.join(' ')}\n${r.stderr}`);
  try { return JSON.parse(r.stdout); }
  catch (e) { die(`could not parse gh JSON: ${e.message}`); }
}

function ageDays(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function main() {
  const threshold = Number(process.env.STALE_DAYS ?? STALE_DAYS);
  const issues = ghJson([
    'issue', 'list',
    '--state', 'open',
    '--limit', '200',
    '--json', 'number,title,labels,updatedAt,url',
  ]);

  const stale = issues
    .map((i) => ({ ...i, ageDays: ageDays(i.updatedAt) }))
    .filter((i) => i.ageDays >= threshold)
    .sort((a, b) => b.ageDays - a.ageDays);

  console.log(c.bold(`\n=== Stale open issues (>= ${threshold} days since last update) ===`));

  if (stale.length === 0) {
    console.log(c.green(`\nAll ${issues.length} open issues are fresh. Nothing to flag.\n`));
    return;
  }

  console.log(c.yellow(`\n${stale.length} of ${issues.length} open issues are stale.`));
  console.log(c.dim(`Recommendation: re-run AC vs code reality check (AI-ISSUE-EXECUTION-PROTOCOL.md §2.5) before exec.\n`));

  for (const i of stale) {
    const labels = i.labels.map((l) => l.name).join(', ');
    console.log(`${c.yellow('!')} ${c.bold('#' + i.number)} (${i.ageDays}d) — ${i.title}`);
    console.log(`   ${c.dim('labels:')} ${labels}`);
    console.log(`   ${c.dim('updated:')} ${i.updatedAt}`);
    console.log(`   ${c.dim('url:')} ${i.url}\n`);
  }

  console.log(c.dim('Next: gh issue view <N> --json body && grep AC files in code before branching.\n'));
}

main();
