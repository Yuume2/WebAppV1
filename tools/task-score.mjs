#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { parseTaskMeta } from './task-meta.mjs';

const PRIORITY_ORDER = ['P0-now', 'P1-week', 'P2-soon', 'P3-backlog'];

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

function ageDays(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function priorityOf(labels) {
  return labels.map((l) => l.name).find((n) => PRIORITY_ORDER.includes(n)) ?? null;
}

function hasLabel(issue, name) {
  return issue.labels.some((l) => l.name === name);
}

function hasSection(body, header) {
  return Boolean(body && body.includes(header));
}

function score(issue) {
  const reasons = [];
  let s = 0;

  const prio = priorityOf(issue.labels);
  const prioPoints = { 'P0-now': 100, 'P1-week': 60, 'P2-soon': 30, 'P3-backlog': 10 };
  if (prio) {
    s += prioPoints[prio];
    reasons.push({ kind: '+', n: prioPoints[prio], why: `priority ${prio}` });
  } else {
    reasons.push({ kind: '-', n: 0, why: 'no priority label' });
  }

  if (hasLabel(issue, 'ai:autonomous')) {
    s += 30;
    reasons.push({ kind: '+', n: 30, why: 'ai:autonomous' });
  }
  if (hasLabel(issue, 'risk:safe')) {
    s += 30;
    reasons.push({ kind: '+', n: 30, why: 'risk:safe' });
  }

  if (hasLabel(issue, 'ai:human-checkpoint')) {
    s -= 200;
    reasons.push({ kind: '-', n: 200, why: 'ai:human-checkpoint (excluded from autonomous queue)' });
  }
  if (hasLabel(issue, 'risk:review-required')) {
    s -= 150;
    reasons.push({ kind: '-', n: 150, why: 'risk:review-required' });
  }
  if (hasLabel(issue, 'risk:destructive')) {
    s -= 1000;
    reasons.push({ kind: '-', n: 1000, why: 'risk:destructive (never autonomous)' });
  }

  const meta = parseTaskMeta(issue.body || '');
  const verifiedAt = meta.acLastVerifiedAt;
  if (verifiedAt) {
    const d = ageDays(verifiedAt);
    if (d <= 7) {
      s += 20;
      reasons.push({ kind: '+', n: 20, why: `AC verified ${d}d ago` });
    } else if (d > 30) {
      s -= 40;
      reasons.push({ kind: '-', n: 40, why: `AC verified ${d}d ago (likely stale)` });
    }
  } else {
    s -= 40;
    reasons.push({ kind: '-', n: 40, why: 'no acLastVerifiedAt → AC reality check needed' });
  }

  const updatedAge = ageDays(issue.updatedAt);
  if (updatedAge > 30) {
    s -= 20;
    reasons.push({ kind: '-', n: 20, why: `last activity ${updatedAge}d ago` });
  }

  if (hasSection(issue.body, '## Test plan')) {
    s += 15;
    reasons.push({ kind: '+', n: 15, why: 'has Test plan section' });
  } else {
    reasons.push({ kind: '-', n: 0, why: 'missing Test plan section' });
  }
  if (hasSection(issue.body, '## Context')) {
    s += 10;
    reasons.push({ kind: '+', n: 10, why: 'has Context section' });
  }
  if (Array.isArray(meta.suspectedFiles) && meta.suspectedFiles.length > 0) {
    s += 10;
    reasons.push({ kind: '+', n: 10, why: 'declares suspectedFiles' });
  }
  if (meta.expectedValidationCommand) {
    s += 10;
    reasons.push({ kind: '+', n: 10, why: 'declares expectedValidationCommand' });
  }

  const cx = (meta.estimatedComplexity || '').toUpperCase();
  if (cx === 'S') { s += 20; reasons.push({ kind: '+', n: 20, why: 'complexity S' }); }
  else if (cx === 'M') { s += 10; reasons.push({ kind: '+', n: 10, why: 'complexity M' }); }
  else if (cx === 'XL') { s -= 10; reasons.push({ kind: '-', n: 10, why: 'complexity XL — split first' }); }

  if (issue.assignees.length > 0) {
    s -= 50;
    reasons.push({ kind: '-', n: 50, why: `already assigned to ${issue.assignees.map(a => a.login).join(',')}` });
  }

  return { score: s, reasons };
}

function classify(issue, scored) {
  if (hasLabel(issue, 'risk:destructive')) return 'EXCLUDED — destructive';
  if (hasLabel(issue, 'ai:human-checkpoint')) return 'EXCLUDED — human checkpoint';
  if (hasLabel(issue, 'risk:review-required')) return 'REVIEW — needs human review';
  if (issue.assignees.length > 0) return 'TAKEN — already assigned';
  if (hasLabel(issue, 'ai:autonomous') && hasLabel(issue, 'risk:safe')) return 'AUTONOMOUS — Claude can do alone';
  return 'UNCLEAR — labels incomplete';
}

function format(issue, { score, reasons }, klass) {
  const labels = issue.labels.map((l) => l.name).join(', ');
  const head = `${c.bold('#' + issue.number)} ${c.bold(`[score=${score}]`)} ${issue.title}`;
  const tag = klass.startsWith('AUTONOMOUS') ? c.green(klass)
    : klass.startsWith('REVIEW') ? c.yellow(klass)
    : klass.startsWith('EXCLUDED') ? c.red(klass)
    : klass.startsWith('TAKEN') ? c.dim(klass)
    : c.yellow(klass);

  const lines = [head, `   ${tag}`, `   ${c.dim('labels:')} ${labels}`];
  for (const r of reasons) {
    if (r.n === 0) lines.push(`   ${c.dim('•')} ${c.dim(r.why)}`);
    else if (r.kind === '+') lines.push(`   ${c.green('+' + r.n)}  ${r.why}`);
    else lines.push(`   ${c.red('-' + r.n)}  ${r.why}`);
  }
  lines.push(`   ${c.dim('url:')} ${issue.url}`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const top = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) || 10 : null;
  const onlyAutonomous = args.includes('--autonomous');
  const json = args.includes('--json');
  const queue = args.includes('--queue');

  const issues = ghJson([
    'issue', 'list',
    '--state', 'open',
    '--limit', '200',
    '--json', 'number,title,labels,assignees,updatedAt,url,body',
  ]);

  const scored = issues.map((i) => ({ issue: i, ...score(i), klass: '' }));
  for (const s of scored) s.klass = classify(s.issue, s);

  scored.sort((a, b) => b.score - a.score || a.issue.number - b.issue.number);

  let view = scored;
  if (onlyAutonomous) view = view.filter((s) => s.klass.startsWith('AUTONOMOUS'));
  if (top) view = view.slice(0, top);

  if (queue) {
    // Compact JSON queue for downstream tooling. Includes recommended next action.
    const out = view.map((s) => ({
      number: s.issue.number,
      title: s.issue.title,
      score: s.score,
      class: s.klass,
      labels: s.issue.labels.map((l) => l.name),
      url: s.issue.url,
      executableNow: s.klass.startsWith('AUTONOMOUS') && s.score > 0,
      blockedReason: s.klass.startsWith('AUTONOMOUS')
        ? null
        : (s.klass.split(' — ')[1] || s.klass),
      recommendedAction: s.klass.startsWith('AUTONOMOUS') && s.score > 0
        ? `pnpm task:run -- --task=${s.issue.number} --plan-only`
        : (s.klass.startsWith('REVIEW')
          ? 'human review required'
          : (s.klass.startsWith('TAKEN') ? 'wait for assignee' : 'needs human decision')),
    }));
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), items: out }, null, 2));
    return;
  }

  if (json) {
    console.log(JSON.stringify(view.map((s) => ({
      number: s.issue.number,
      title: s.issue.title,
      score: s.score,
      class: s.klass,
      reasons: s.reasons,
    })), null, 2));
    return;
  }

  console.log(c.bold(`\n=== Task scoring (${view.length}/${issues.length} issues) ===\n`));
  for (const s of view) {
    console.log(format(s.issue, s, s.klass));
    console.log('');
  }

  const counts = scored.reduce((acc, s) => {
    const k = s.klass.split(' —')[0];
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  console.log(c.dim('Summary: ') + Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(', '));
  console.log(c.dim('\nFlags: --top N | --autonomous | --json'));
}

main();
