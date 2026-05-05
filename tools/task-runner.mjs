#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { parseTaskMeta } from './task-meta.mjs';
import { evaluateDiff } from './task-guard.mjs';

// task-runner — single-task orchestrator.
//
// Default mode is DRY-RUN: prints the plan, runs preflight checks, evaluates
// the candidate task against scoring + guard rules, and stops without
// modifying the repo or GitHub.
//
// `--task=N`     pin a specific issue number
// `--dry-run`    explicit (default behavior anyway)
// `--plan-only`  print plan and exit before any side effects
// `--exec`       allow side effects up to PR creation (still no auto-merge)
//
// `--loop` is intentionally NOT implemented here. Loop runner will be a
// separate file once Phase 2 is proven.
//
// Hard refusals (exit non-zero):
//   - branch not main or known feature branch
//   - dirty working tree
//   - guard violations on prospective diff (only when --exec)
//   - issue has risk:destructive / ai:human-checkpoint
//   - no candidate task

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

const PRIORITY_POINTS = { 'P0-now': 100, 'P1-week': 60, 'P2-soon': 30, 'P3-backlog': 10 };
const HARD_EXCLUDE = new Set(['risk:destructive', 'ai:human-checkpoint']);
const REQUIRED = new Set(['ai:autonomous', 'risk:safe']);

function die(msg, code = 1) { console.error(c.red(`error: ${msg}`)); process.exit(code); }

function run(bin, argv) {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function ghJson(args) {
  const r = run('gh', args);
  if (r.code !== 0) die(`gh ${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function preflight({ requireClean }) {
  const checks = [];
  const which = run('which', ['gh']);
  checks.push({ name: 'gh CLI', ok: which.code === 0, detail: which.stdout.trim() });
  const auth = run('gh', ['auth', 'status']);
  checks.push({ name: 'gh auth', ok: auth.code === 0, detail: 'authenticated' });
  const status = run('git', ['status', '--porcelain']);
  const dirty = status.stdout.trim().split('\n').filter((l) => l && !l.startsWith('?? .claude/'));
  const dirtyOk = dirty.length === 0;
  checks.push({
    name: 'git working tree',
    ok: requireClean ? dirtyOk : true,
    detail: dirtyOk ? 'clean' : `${dirty.length} change(s) — ${requireClean ? 'refusing to run --exec' : 'tolerated for plan-only'}`,
    severity: requireClean && !dirtyOk ? 'fail' : (!dirtyOk ? 'warn' : 'ok'),
  });
  const branch = run('git', ['branch', '--show-current']).stdout.trim();
  checks.push({ name: 'git branch', ok: true, detail: branch });

  return { checks, branch };
}

function score(issue) {
  const labels = issue.labels.map((l) => l.name);
  const reasons = [];
  let s = 0;
  for (const [p, n] of Object.entries(PRIORITY_POINTS)) {
    if (labels.includes(p)) { s += n; reasons.push(`+${n} ${p}`); break; }
  }
  if (labels.includes('ai:autonomous')) { s += 30; reasons.push('+30 ai:autonomous'); }
  if (labels.includes('risk:safe'))     { s += 30; reasons.push('+30 risk:safe'); }
  if (labels.includes('ai:human-checkpoint')) { s -= 200; reasons.push('-200 human-checkpoint'); }
  if (labels.includes('risk:review-required')) { s -= 150; reasons.push('-150 review-required'); }
  if (labels.includes('risk:destructive')) { s -= 1000; reasons.push('-1000 destructive'); }
  if (issue.assignees.length) { s -= 50; reasons.push(`-50 assigned`); }
  return { score: s, reasons };
}

function pickCandidate(issues, pinned) {
  if (pinned) {
    const found = issues.find((i) => i.number === pinned);
    if (!found) die(`#${pinned} not found among open issues`);
    return found;
  }
  const eligible = issues.filter((i) => {
    const labels = new Set(i.labels.map((l) => l.name));
    if ([...HARD_EXCLUDE].some((x) => labels.has(x))) return false;
    if (![...REQUIRED].every((x) => labels.has(x))) return false;
    if (i.assignees.length > 0) return false;
    return true;
  });
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => score(b).score - score(a).score || a.number - b.number);
  return eligible[0];
}

function checkSafety(issue) {
  const violations = [];
  const labels = new Set(issue.labels.map((l) => l.name));
  for (const x of HARD_EXCLUDE) {
    if (labels.has(x)) violations.push(`label ${x} forbids autonomous execution`);
  }
  if (!labels.has('ai:autonomous')) violations.push('missing ai:autonomous label');
  if (!labels.has('risk:safe')) violations.push('missing risk:safe label');
  // text heuristics on body
  const body = (issue.body || '').toLowerCase();
  const danger = ['stripe', 'billing', 'production database', 'prod-data', 'drop table', 'delete from', 'rm -rf'];
  for (const d of danger) {
    if (body.includes(d)) violations.push(`body mentions sensitive keyword: "${d}"`);
  }
  return violations;
}

function checkDeps(issue, allIssues) {
  const meta = parseTaskMeta(issue.body || '');
  const deps = Array.isArray(meta.dependsOn) ? meta.dependsOn : [];
  if (deps.length === 0) return { ok: true, deps };
  const byNumber = new Map(allIssues.map((i) => [i.number, i]));
  const open = deps.filter((d) => byNumber.get(d)?.state === 'OPEN');
  const missing = deps.filter((d) => !byNumber.has(d));
  return { ok: open.length === 0 && missing.length === 0, deps, open, missing };
}

function emitPlan({ candidate, scored, safetyViolations, depCheck, mode, branchName }) {
  const lines = [];
  lines.push(c.bold('\n=== task-runner plan ==='));
  lines.push(`${c.cyan('mode:')}        ${mode}`);
  lines.push(`${c.cyan('candidate:')}   #${candidate.number} — ${candidate.title}`);
  lines.push(`${c.cyan('score:')}       ${scored.score}`);
  lines.push(`${c.cyan('reasons:')}     ${scored.reasons.join(', ')}`);
  lines.push(`${c.cyan('labels:')}      ${candidate.labels.map((l) => l.name).join(', ')}`);
  lines.push(`${c.cyan('url:')}         ${candidate.url}`);
  lines.push(`${c.cyan('branch (proposed):')} ${branchName}`);
  if (depCheck.deps.length) {
    lines.push(`${c.cyan('deps:')}        ${depCheck.deps.map((n) => '#' + n).join(', ')}`);
    if (depCheck.open?.length) lines.push(c.yellow(`              open deps: ${depCheck.open.map((n) => '#' + n).join(', ')}`));
    if (depCheck.missing?.length) lines.push(c.red(`              missing refs: ${depCheck.missing.map((n) => '#' + n).join(', ')}`));
  }
  if (safetyViolations.length) {
    lines.push(c.red('\nsafety violations:'));
    for (const v of safetyViolations) lines.push(`  - ${v}`);
  } else {
    lines.push(c.green('\nsafety: ✓ all label/keyword gates passed'));
  }
  lines.push('');
  lines.push(c.dim('Next steps that would run on --exec:'));
  lines.push(c.dim('  1. AC vs code reality check (manual or assisted)'));
  lines.push(c.dim('  2. pnpm project:status:in-progress <N>'));
  lines.push(c.dim('  3. git switch -c ' + branchName));
  lines.push(c.dim('  4. follow project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md'));
  lines.push(c.dim('  5. before commit: node tools/task-guard.mjs --staged'));
  lines.push(c.dim('  6. open PR with Closes #<N>; pnpm project:status:review <N>'));
  lines.push(c.dim('  7. STOP. No auto-merge.'));
  lines.push('');
  return lines.join('\n');
}

export function deriveBranchName(issue) {
  const labels = issue.labels.map((l) => l.name);
  const role = labels.includes('role:backend') ? 'api'
    : labels.includes('role:frontend') ? 'web'
    : 'coord';
  const type = labels.includes('type:fix') ? 'fix'
    : labels.includes('type:chore') ? 'chore'
    : labels.includes('type:docs') ? 'docs'
    : labels.includes('type:test') ? 'test'
    : labels.includes('type:refactor') ? 'refactor'
    : 'feat';
  const slug = issue.title
    .toLowerCase()
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[a-z]+\([^)]*\)\s*:\s*/, '')
    .replace(/^[a-z]+\s*:\s*/, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(new RegExp(`^${role}-`), '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `${type}/${role}-${slug}-#${issue.number}`;
}

function main() {
  const args = process.argv.slice(2);
  const PIN = (() => {
    const t = args.find((a) => a.startsWith('--task='));
    return t ? Number(t.split('=')[1]) : null;
  })();
  const PLAN_ONLY = args.includes('--plan-only');
  const EXEC = args.includes('--exec');
  const JSON_OUT = args.includes('--json');

  if (args.includes('--loop')) die('--loop is not implemented in task-runner.mjs. Use the future task-loop.mjs (Phase 2.5).', 2);

  const mode = EXEC ? 'EXEC (will run protocol steps)' : 'DRY-RUN (no side effects)';
  const pre = preflight({ requireClean: EXEC });

  if (!pre.checks.every((c) => c.ok)) {
    if (JSON_OUT) console.log(JSON.stringify({ status: 'preflight-failed', preflight: pre }, null, 2));
    else {
      console.log(c.bold('\n=== task-runner preflight ==='));
      for (const ch of pre.checks) {
        console.log(`  ${ch.ok ? c.green('✓') : c.red('✗')} ${ch.name}: ${ch.detail}`);
      }
      console.log(c.red('\npreflight failed — refusing to continue.\n'));
    }
    process.exit(1);
  }

  // Plan-only path may still want to surface a dirty tree as a warning.
  if (!EXEC) {
    const warn = pre.checks.find((c) => c.severity === 'warn');
    if (warn && !JSON_OUT) {
      console.log(c.yellow(`note: ${warn.name}: ${warn.detail}`));
    }
  }

  const issues = ghJson([
    'issue', 'list',
    '--state', 'all',
    '--limit', '500',
    '--json', 'number,title,labels,assignees,body,url,state,updatedAt',
  ]);
  const open = issues.filter((i) => i.state === 'OPEN');

  const candidate = pickCandidate(open, PIN);
  if (!candidate) {
    console.log(c.yellow('\nno candidate task found (no open issue with ai:autonomous + risk:safe + unassigned).\n'));
    if (JSON_OUT) console.log(JSON.stringify({ status: 'no-candidate' }, null, 2));
    return;
  }

  const scored = score(candidate);
  const safetyViolations = checkSafety(candidate);
  const depCheck = checkDeps(candidate, issues);
  const branchName = deriveBranchName(candidate);

  const plan = {
    mode,
    candidate: { number: candidate.number, title: candidate.title, url: candidate.url },
    score: scored.score,
    reasons: scored.reasons,
    safetyViolations,
    depCheck,
    branchName,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(emitPlan({ candidate, scored, safetyViolations, depCheck, mode, branchName }));
  }

  if (PLAN_ONLY || !EXEC) return;

  // EXEC path — Phase 2 minimal: only the safe, reversible setup steps.
  // We deliberately do NOT call Claude here, do not commit, do not push.
  // We prepare the working environment, then hand off.

  if (safetyViolations.length) die('refusing to exec with safety violations');
  if (!depCheck.ok) die('refusing to exec while deps are open');
  if (scored.score <= 0) die('refusing to exec with non-positive score');

  console.log(c.bold('\n=== task-runner exec (setup only) ==='));
  const inProgress = run('node', ['tools/issue-status.mjs', String(candidate.number), '--status', 'In Progress']);
  if (inProgress.code === 0) console.log(c.green(`✓ marked #${candidate.number} In Progress`));
  else console.error(c.yellow(`could not set status (continuing): ${inProgress.stderr}`));

  const branch = run('git', ['switch', '-c', branchName]);
  if (branch.code === 0) console.log(c.green(`✓ created branch ${branchName}`));
  else die(`could not create branch: ${branch.stderr}`);

  console.log(c.bold('\nHand-off:'));
  console.log(`  Now follow project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md from §6 (code).`);
  console.log(`  Before each commit: ${c.cyan('node tools/task-guard.mjs --staged')}`);
  console.log(`  When done: open PR with body containing "Closes #${candidate.number}", then ${c.cyan('pnpm project:status:review ' + candidate.number)}.`);
  console.log(c.red('\nDo NOT auto-merge. Yume merges.\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
