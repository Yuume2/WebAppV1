#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const PRIORITY_ORDER = ['P0-now', 'P1-week', 'P2-soon', 'P3-backlog'];
const DISQUALIFYING = new Set(['ai:human-checkpoint', 'risk:destructive', 'risk:review-required']);
const REQUIRED = ['ai:autonomous', 'risk:safe'];

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

function priorityRank(labels) {
  const names = labels.map((l) => l.name);
  for (let i = 0; i < PRIORITY_ORDER.length; i++) {
    if (names.includes(PRIORITY_ORDER[i])) return i;
  }
  return PRIORITY_ORDER.length;
}

function priorityLabel(labels) {
  return labels.map((l) => l.name).find((n) => PRIORITY_ORDER.includes(n)) ?? 'no-priority';
}

function isAutonomous(labels) {
  const names = new Set(labels.map((l) => l.name));
  if (REQUIRED.some((r) => !names.has(r))) return false;
  for (const d of DISQUALIFYING) if (names.has(d)) return false;
  return true;
}

function disqualifierFor(labels) {
  const names = new Set(labels.map((l) => l.name));
  const reasons = [];
  for (const r of REQUIRED) if (!names.has(r)) reasons.push(`missing ${r}`);
  for (const d of DISQUALIFYING) if (names.has(d)) reasons.push(`has ${d}`);
  return reasons.join(', ');
}

function format(issue, badge) {
  const labels = issue.labels.map((l) => l.name).join(', ');
  const assignees = issue.assignees.map((a) => a.login).join(', ') || c.dim('unassigned');
  return [
    `${badge} ${c.bold('#' + issue.number)} — ${issue.title}`,
    `   ${c.dim('labels:')} ${labels}`,
    `   ${c.dim('assignees:')} ${assignees}`,
    `   ${c.dim('updated:')} ${issue.updatedAt}`,
    `   ${c.dim('url:')} ${issue.url}`,
  ].join('\n');
}

function main() {
  const issues = ghJson([
    'issue', 'list',
    '--state', 'open',
    '--limit', '100',
    '--json', 'number,title,labels,assignees,updatedAt,url',
  ]);

  if (issues.length === 0) {
    console.log(c.yellow('no open issues.'));
    return;
  }

  const autonomous = issues
    .filter((i) => isAutonomous(i.labels))
    .filter((i) => i.assignees.length === 0)
    .sort((a, b) => priorityRank(a.labels) - priorityRank(b.labels) || a.number - b.number);

  console.log(c.bold('\n=== Next AI-ready task ==='));

  if (autonomous.length === 0) {
    console.log(c.yellow('\nNo open issue passes the auto-pick filter.'));
    console.log(c.dim('Filter: ai:autonomous + risk:safe, no ai:human-checkpoint / risk:destructive / risk:review-required, no assignee.'));
    console.log(c.dim('\nFalling back to all open issues sorted by priority:\n'));
    const all = [...issues].sort((a, b) => priorityRank(a.labels) - priorityRank(b.labels) || a.number - b.number);
    for (const i of all.slice(0, 10)) {
      const reason = disqualifierFor(i.labels) || (i.assignees.length ? 'already assigned' : 'unknown');
      console.log(format(i, c.yellow('!')) + `\n   ${c.dim('skipped:')} ${reason}\n`);
    }
    return;
  }

  const top = autonomous[0];
  console.log('\n' + format(top, c.green('►')));
  console.log(`\n${c.bold('Why:')} top priority (${priorityLabel(top.labels)}), ai:autonomous + risk:safe, unassigned.`);
  console.log(`\n${c.bold('Start command:')}`);
  console.log(c.cyan(`  pnpm project:status:in-progress ${top.number}`));
  console.log(`\n${c.bold('Then follow:')} project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md`);
  console.log(c.dim('\nPrompt template: project-memory/prompts/execute-issue.md (replace <N> with ' + top.number + ')\n'));

  if (autonomous.length > 1) {
    console.log(c.dim('Other autonomous candidates:'));
    for (const i of autonomous.slice(1, 6)) {
      console.log(c.dim(`  #${i.number} [${priorityLabel(i.labels)}] ${i.title}`));
    }
    console.log();
  }
}

main();
