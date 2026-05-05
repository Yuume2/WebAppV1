#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { parseTaskMeta } from './task-meta.mjs';

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
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) die(`gh ${args.join(' ')}\n${r.stderr}`);
  try { return JSON.parse(r.stdout); }
  catch (e) { die(`could not parse gh JSON: ${e.message}`); }
}

// Parses dependency hints from issue body. Two conventions accepted:
//   1. Plain line:   "Depends on: #12, #34"  (case-insensitive)
//   2. task-meta v1 block dependsOn list
// Returns sorted unique array of issue numbers.
export function parseDependsOn(body) {
  if (!body) return [];
  const found = new Set();

  const plain = body.match(/^[ \t]*depends?\s*on\s*:\s*(.+)$/im);
  if (plain) {
    for (const m of plain[1].matchAll(/#?(\d+)/g)) found.add(Number(m[1]));
  }

  const meta = parseTaskMeta(body);
  if (Array.isArray(meta.dependsOn)) {
    for (const n of meta.dependsOn) {
      if (Number.isInteger(n) && n > 0) found.add(n);
    }
  }

  return [...found].sort((a, b) => a - b);
}

function detectCycles(graph) {
  const cycles = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const k of graph.keys()) color.set(k, WHITE);

  function dfs(node, stack) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      const c = color.get(next);
      if (c === GRAY) {
        const i = stack.indexOf(next);
        cycles.push(stack.slice(i).concat(next));
      } else if (c === WHITE) {
        dfs(next, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const k of graph.keys()) {
    if (color.get(k) === WHITE) dfs(k, []);
  }
  return cycles;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const showAll = args.includes('--all');

  // Open + closed (closed needed to know what's unblocked).
  const issues = ghJson([
    'issue', 'list',
    '--state', 'all',
    '--limit', '500',
    '--json', 'number,title,state,labels,body,url',
  ]);

  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const open = issues.filter((i) => i.state === 'OPEN');

  // Build dependency graph: issue -> its deps
  const deps = new Map();
  for (const i of open) deps.set(i.number, parseDependsOn(i.body));

  // Reverse graph: who depends on N
  const reverse = new Map();
  for (const [n, ds] of deps) {
    for (const d of ds) {
      if (!reverse.has(d)) reverse.set(d, []);
      reverse.get(d).push(n);
    }
  }

  // Build subgraph for cycle detection (only open nodes pointing to other open nodes)
  const cycleGraph = new Map();
  for (const [n, ds] of deps) {
    cycleGraph.set(n, ds.filter((d) => byNumber.get(d)?.state === 'OPEN'));
  }
  const cycles = detectCycles(cycleGraph);

  const ready = [];
  const blocked = [];
  const noDeps = [];

  for (const i of open) {
    const ds = deps.get(i.number) || [];
    if (ds.length === 0) { noDeps.push(i); continue; }
    const openDeps = ds.filter((d) => byNumber.get(d)?.state === 'OPEN');
    const missingDeps = ds.filter((d) => !byNumber.has(d));
    if (openDeps.length === 0 && missingDeps.length === 0) {
      ready.push({ issue: i, deps: ds });
    } else {
      blocked.push({ issue: i, deps: ds, openDeps, missingDeps });
    }
  }

  if (json) {
    console.log(JSON.stringify({
      ready: ready.map((r) => ({ number: r.issue.number, title: r.issue.title, deps: r.deps })),
      blocked: blocked.map((b) => ({
        number: b.issue.number, title: b.issue.title, deps: b.deps,
        openDeps: b.openDeps, missingDeps: b.missingDeps,
      })),
      noDeps: noDeps.map((i) => ({ number: i.number, title: i.title })),
      cycles,
    }, null, 2));
    return;
  }

  console.log(c.bold(`\n=== Task dependency graph ===`));
  console.log(c.dim(`open issues: ${open.length}  with deps: ${open.length - noDeps.length}  ready (deps closed): ${ready.length}  blocked: ${blocked.length}  cycles: ${cycles.length}\n`));

  if (cycles.length > 0) {
    console.log(c.red(c.bold('CYCLES DETECTED:')));
    for (const cy of cycles) console.log(c.red('  ' + cy.map((n) => '#' + n).join(' → ')));
    console.log('');
  }

  console.log(c.bold(c.green('Ready (all deps closed):')));
  if (ready.length === 0) console.log(c.dim('  (none)'));
  for (const r of ready) {
    console.log(`  ${c.green('►')} #${r.issue.number} — ${r.issue.title}`);
    console.log(c.dim(`    deps closed: ${r.deps.map((d) => '#' + d).join(', ')}`));
  }

  console.log('\n' + c.bold(c.yellow('Blocked (open deps remain):')));
  if (blocked.length === 0) console.log(c.dim('  (none)'));
  for (const b of blocked) {
    console.log(`  ${c.yellow('!')} #${b.issue.number} — ${b.issue.title}`);
    if (b.openDeps.length) console.log(c.dim(`    waiting on open: ${b.openDeps.map((d) => '#' + d).join(', ')}`));
    if (b.missingDeps.length) console.log(c.red(`    unknown refs: ${b.missingDeps.map((d) => '#' + d).join(', ')}`));
  }

  if (showAll) {
    console.log('\n' + c.bold(c.dim('Open with no declared deps:')));
    for (const i of noDeps) console.log(c.dim(`  #${i.number} — ${i.title}`));
  } else {
    console.log(c.dim(`\n(${noDeps.length} open issues have no declared deps. Run with --all to list them.)`));
  }

  if (open.some((i) => parseDependsOn(i.body).length === 0)) {
    console.log(c.dim(`\nConvention: declare deps via "Depends on: #12, #34" line, or "dependsOn: 12, 34" inside the task-meta v1 HTML comment.`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
