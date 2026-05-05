#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// task-doctor — full diagnostic of the autonomous task system.
// Read-only. Prints a status board and exits 0.
// Failed checks are surfaced but never abort exit (exit 0 on warnings).
// Exit 1 only when a critical local invariant is broken (missing tool file).

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function run(bin, argv, opts = {}) {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function ghJsonSafe(args) {
  const r = run('gh', args);
  if (r.code !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

const status = {
  OK: 'ok',
  WARN: 'warn',
  FAIL: 'fail',
  NA: 'n/a',
};

export function checkLocalScripts() {
  const required = [
    'tools/next-task.mjs',
    'tools/stale-check.mjs',
    'tools/task-score.mjs',
    'tools/task-deps.mjs',
    'tools/task-meta.mjs',
    'tools/task-meta-backfill.mjs',
    'tools/task-guard.mjs',
    'tools/task-questions.mjs',
    'tools/task-runner.mjs',
    'tools/issue-status.mjs',
    'tools/apply-issue-delta.mjs',
    'tools/create-github-issues.mjs',
  ];
  const missing = required.filter((p) => !existsSync(resolve(REPO_ROOT, p)));
  return missing.length === 0
    ? { status: status.OK, detail: `all ${required.length} required scripts present` }
    : { status: status.FAIL, detail: `missing: ${missing.join(', ')}` };
}

export function checkRequiredDocs() {
  const docs = [
    'docs/ops/task-runner.md',
    'docs/ops/notion-sync.md',
    'docs/ops/whatsapp-notif.md',
    'docs/ops/branch-protection-checklist.md',
    'docs/ops/first-autonomous-run.md',
    'docs/ops/autonomous-claude-code-prompt.md',
    'docs/ops/task-meta-backfill-preview.md',
    'project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md',
    'project-memory/04-active-tasks.md',
    'CLAUDE_NEEDS.md',
  ];
  const missing = docs.filter((p) => !existsSync(resolve(REPO_ROOT, p)));
  return missing.length === 0
    ? { status: status.OK, detail: `all ${docs.length} ops docs present` }
    : { status: status.WARN, detail: `missing: ${missing.join(', ')}` };
}

function checkPackageScripts() {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  const expected = [
    'task:next', 'task:score', 'task:deps', 'task:stale',
    'task:guard', 'task:run', 'task:meta', 'task:meta:backfill',
    'task:questions', 'task:doctor', 'task:test',
  ];
  const missing = expected.filter((s) => !scripts[s]);
  return missing.length === 0
    ? { status: status.OK, detail: `all ${expected.length} task:* scripts wired` }
    : { status: status.WARN, detail: `missing scripts: ${missing.join(', ')}` };
}

export function checkPhase3Secrets(env = process.env) {
  const required = ['NOTION_TOKEN', 'NOTION_QUESTIONS_DATABASE_ID'];
  const present = required.filter((k) => env[k]);
  if (present.length === 0) return { status: status.NA, detail: 'Phase 3 secrets not configured (expected — Phase 3 not active)' };
  if (present.length < required.length) return { status: status.WARN, detail: `partial: ${present.join(',')}; missing ${required.filter((k) => !env[k]).join(',')}` };
  return { status: status.OK, detail: 'Phase 3 secrets present in env' };
}

function checkGit() {
  const branch = run('git', ['branch', '--show-current']).stdout.trim();
  const dirtyRaw = run('git', ['status', '--porcelain']).stdout;
  const dirty = dirtyRaw.split('\n').filter((l) => l && !l.startsWith('?? .claude/'));
  const ahead = run('git', ['rev-list', '--count', `origin/main..HEAD`]).stdout.trim();
  return {
    branch,
    dirtyCount: dirty.length,
    ahead: Number(ahead) || 0,
  };
}

export function rulesetTargetsMain(ruleset) {
  if (!ruleset || ruleset.enforcement !== 'active') return false;
  if (ruleset.target !== 'branch') return false;
  const include = ruleset.conditions?.ref_name?.include ?? [];
  const exclude = ruleset.conditions?.ref_name?.exclude ?? [];
  const targetsMain = include.some((p) => p === '~DEFAULT_BRANCH' || p === '~ALL' || p === 'refs/heads/main' || p === 'main');
  const explicitlyExcluded = exclude.some((p) => p === 'refs/heads/main' || p === 'main');
  return targetsMain && !explicitlyExcluded;
}

function checkBranchProtection() {
  const classic = run('gh', ['api', 'repos/Yuume2/WebAppV1/branches/main/protection']);
  if (classic.code === 0) return { status: status.OK, detail: 'main is protected (classic branch protection)' };

  // Fall back to repository rulesets — required for repos using the new ruleset model.
  // The list endpoint omits `conditions`, so candidate rulesets must be re-fetched
  // individually via /rulesets/{id} to inspect ref_name include/exclude.
  const list = run('gh', ['api', 'repos/Yuume2/WebAppV1/rulesets']);
  if (list.code === 0) {
    let parsed = [];
    try { parsed = JSON.parse(list.stdout); } catch { parsed = []; }
    const candidates = parsed.filter((r) => r.enforcement === 'active' && r.target === 'branch');
    const matched = [];
    for (const c of candidates) {
      const detail = run('gh', ['api', `repos/Yuume2/WebAppV1/rulesets/${c.id}`]);
      if (detail.code !== 0) continue;
      let full;
      try { full = JSON.parse(detail.stdout); } catch { continue; }
      if (rulesetTargetsMain(full)) matched.push(full);
    }
    if (matched.length > 0) {
      const names = matched.map((r) => `"${r.name}"`).join(', ');
      return { status: status.OK, detail: `active via ruleset ${names}` };
    }
  }

  if (/Branch not protected/i.test(classic.stderr) || /404/.test(classic.stderr)) {
    return { status: status.WARN, detail: 'main NOT protected — no classic protection and no active ruleset targets main' };
  }
  return { status: status.WARN, detail: `cannot read protection: ${classic.stderr.split('\n')[0]}` };
}

function checkGhAuth() {
  const r = run('gh', ['auth', 'status']);
  return r.code === 0
    ? { status: status.OK, detail: 'authenticated' }
    : { status: status.FAIL, detail: 'gh not authenticated — run gh auth login' };
}

function checkOpenIssuesMeta() {
  const issues = ghJsonSafe([
    'issue', 'list', '--state', 'open', '--limit', '200',
    '--json', 'number,body,labels',
  ]);
  if (!issues) return { status: status.WARN, detail: 'cannot list issues' };
  let withMeta = 0, autonomous = 0;
  for (const i of issues) {
    if ((i.body || '').includes('<!-- task-meta v1')) withMeta++;
    const ls = new Set(i.labels.map((l) => l.name));
    if (ls.has('ai:autonomous') && ls.has('risk:safe') && !ls.has('ai:human-checkpoint') && !ls.has('risk:destructive') && !ls.has('risk:review-required')) {
      autonomous++;
    }
  }
  const total = issues.length;
  return {
    total,
    withMeta,
    withoutMeta: total - withMeta,
    autonomous,
    status: total === 0 ? status.NA
      : withMeta === 0 ? status.WARN
      : withMeta === total ? status.OK : status.WARN,
    detail: `${withMeta}/${total} have task-meta · ${autonomous}/${total} pass autonomous filter`,
  };
}

function checkPendingQuestions() {
  // Minimal: count question markers across all open issue comments.
  // Uses gh search to keep cost low.
  const j = ghJsonSafe(['search', 'issues', '--repo', 'Yuume2/WebAppV1', '--state', 'open', '--limit', '100', '--json', 'number,commentsCount']);
  if (!j) return { status: status.NA, detail: 'cannot search' };
  const issuesWithComments = j.filter((x) => (x.commentsCount || 0) > 0);
  if (issuesWithComments.length === 0) return { status: status.OK, detail: 'no open issues have comments — no pending questions to check' };
  return { status: status.NA, detail: `${issuesWithComments.length} open issue(s) with comments — full Q/A scan available via pnpm task:questions list` };
}

function checkGuardOnCurrentDiff() {
  const r = run('node', ['tools/task-guard.mjs', '--json']);
  if (r.code === 0) return { status: status.OK, detail: 'no guard violations on current diff' };
  if (r.code === 1) {
    try {
      const j = JSON.parse(r.stdout);
      return { status: status.WARN, detail: `${j.violations?.length || 0} guard violation(s) — review before any commit` };
    } catch {
      return { status: status.WARN, detail: 'guard reports violations (cannot parse output)' };
    }
  }
  return { status: status.FAIL, detail: `guard error: ${r.stderr.split('\n')[0]}` };
}

function fmtStatus(s) {
  if (s === status.OK)   return c.green('✓');
  if (s === status.WARN) return c.yellow('⚠');
  if (s === status.FAIL) return c.red('✗');
  if (s === status.NA)   return c.dim('·');
  return c.dim('?');
}

function gateLine(label, blockers) {
  if (blockers.length === 0) return `${c.green('READY')}    ${c.bold(label)}`;
  return `${c.yellow('PENDING')}  ${c.bold(label)}\n            ${c.dim(blockers.join('; '))}`;
}

function main() {
  const json = process.argv.includes('--json');
  const report = {
    generatedAt: new Date().toISOString(),
    local: {
      scripts: checkLocalScripts(),
      packageScripts: checkPackageScripts(),
      docs: checkRequiredDocs(),
      git: checkGit(),
    },
    github: {
      auth: checkGhAuth(),
      branchProtection: checkBranchProtection(),
      openIssuesMeta: checkOpenIssuesMeta(),
      pendingQuestions: checkPendingQuestions(),
    },
    runtime: {
      guard: checkGuardOnCurrentDiff(),
      phase3Secrets: checkPhase3Secrets(),
    },
  };

  const phase2Blockers = [];
  if (report.github.branchProtection.status === status.WARN) phase2Blockers.push('branch protection on main');
  if (report.local.git.dirtyCount > 0) phase2Blockers.push(`${report.local.git.dirtyCount} uncommitted changes`);
  if (report.github.openIssuesMeta.withMeta === 0) phase2Blockers.push('no issues have task-meta yet');
  if (report.runtime.guard.status === status.FAIL) phase2Blockers.push('guard not operational');

  const phase3Blockers = [];
  if (report.runtime.phase3Secrets.status !== status.OK) phase3Blockers.push('Phase 3 secrets not configured');
  if (!existsSync(resolve(REPO_ROOT, 'docs/ops/whatsapp-notif.md'))) phase3Blockers.push('whatsapp-notif.md missing');

  const phase4Blockers = [
    ...phase2Blockers,
    ...phase3Blockers,
    'budget policy not codified yet',
    'task-loop runner not built',
  ];

  if (json) {
    console.log(JSON.stringify({
      ...report,
      gates: {
        phase2: { ready: phase2Blockers.length === 0, blockers: phase2Blockers },
        phase3: { ready: phase3Blockers.length === 0, blockers: phase3Blockers },
        phase4: { ready: false, blockers: phase4Blockers },
      },
    }, null, 2));
    return;
  }

  console.log(c.bold('\n=== task-doctor ==='));
  console.log(c.dim(`generated: ${report.generatedAt}\n`));

  console.log(c.bold('Local'));
  console.log(`  ${fmtStatus(report.local.scripts.status)} scripts:        ${report.local.scripts.detail}`);
  console.log(`  ${fmtStatus(report.local.packageScripts.status)} package.json:   ${report.local.packageScripts.detail}`);
  console.log(`  ${fmtStatus(report.local.docs.status)} ops docs:       ${report.local.docs.detail}`);
  console.log(`  ${c.dim('·')} branch:         ${report.local.git.branch} ${c.dim(`(${report.local.git.dirtyCount} dirty, ${report.local.git.ahead} ahead of origin/main)`)}`);

  console.log('\n' + c.bold('GitHub'));
  console.log(`  ${fmtStatus(report.github.auth.status)} gh auth:        ${report.github.auth.detail}`);
  console.log(`  ${fmtStatus(report.github.branchProtection.status)} main protection: ${report.github.branchProtection.detail}`);
  const m = report.github.openIssuesMeta;
  console.log(`  ${fmtStatus(m.status)} open issues:    ${m.detail}`);
  console.log(`  ${fmtStatus(report.github.pendingQuestions.status)} questions:      ${report.github.pendingQuestions.detail}`);

  console.log('\n' + c.bold('Runtime'));
  console.log(`  ${fmtStatus(report.runtime.guard.status)} guard (diff):   ${report.runtime.guard.detail}`);
  console.log(`  ${fmtStatus(report.runtime.phase3Secrets.status)} Phase 3 secrets: ${report.runtime.phase3Secrets.detail}`);

  console.log('\n' + c.bold('Phase gates'));
  console.log('  ' + gateLine('Phase 1 — Backlog precision', []));
  console.log('  ' + gateLine('Phase 2 — Single-task runner --exec', phase2Blockers));
  console.log('  ' + gateLine('Phase 3 — Notion + WhatsApp + n8n', phase3Blockers));
  console.log('  ' + gateLine('Phase 4 — Multi-task loop', phase4Blockers));

  console.log('\n' + c.bold('Recommended next actions'));
  if (phase2Blockers.length === 0) {
    console.log(`  ${c.green('►')} Phase 2 is unlocked. Run: ${c.cyan('pnpm task:next')} then ${c.cyan('pnpm task:run -- --plan-only')}`);
  } else {
    if (phase2Blockers.includes('branch protection on main')) console.log(`  ${c.yellow('!')} Activate branch protection (see docs/ops/branch-protection-checklist.md)`);
    if (phase2Blockers.find((b) => b.includes('uncommitted'))) console.log(`  ${c.yellow('!')} Commit or stash current changes`);
    if (phase2Blockers.includes('no issues have task-meta yet')) console.log(`  ${c.yellow('!')} Run: ${c.cyan('pnpm task:meta:backfill -- --yes --confirm "I MEAN IT"')} (preview already at docs/ops/task-meta-backfill-preview.md)`);
  }
  console.log();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
