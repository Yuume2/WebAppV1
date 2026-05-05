#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

// task-guard — inspect a working diff and reject changes that fall outside
// what an autonomous agent is allowed to do without human review.
//
// Read-only. Returns:
//   exit 0 → diff is safe to commit autonomously
//   exit 1 → guard violations (printed)
//   exit 2 → environment problem
//
// Default base ref is `main`. Override with --base <ref>.
//
// Usage:
//   node tools/task-guard.mjs                # diff vs main
//   node tools/task-guard.mjs --base origin/main
//   node tools/task-guard.mjs --staged       # diff --cached
//   node tools/task-guard.mjs --json
//
// Importable: import { evaluateDiff, RULES } from './task-guard.mjs'

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// Hard rules — any match blocks autonomous commit.
// Each rule: id, kind (path|count|content), test(input) → boolean, why.
export const RULES = [
  {
    id: 'db-migrations',
    kind: 'path',
    pattern: /^apps\/api\/(src\/)?db\/migrations\//i,
    why: 'database migrations require human review',
  },
  {
    id: 'db-schema',
    kind: 'path',
    pattern: /^apps\/api\/src\/db\/schema/i,
    why: 'DB schema changes require human review',
  },
  {
    id: 'auth-cipher',
    kind: 'path',
    pattern: /^apps\/api\/src\/lib\/(api-key-cipher|sessions|sentry)/i,
    why: 'auth, encryption and Sentry wiring are sensitive',
  },
  {
    id: 'workflows',
    kind: 'path',
    pattern: /^\.github\/workflows\//i,
    why: 'CI workflows are self-modifying — human review required',
  },
  {
    id: 'docker-infra',
    kind: 'path',
    pattern: /^(docker-compose\.ya?ml|Dockerfile.*)$/i,
    why: 'infrastructure files require human review',
  },
  {
    id: 'env-files',
    kind: 'path',
    pattern: /(^|\/)\.env(\..+)?$/i,
    why: '.env files may contain or imply secrets',
  },
  {
    id: 'lockfile',
    kind: 'path',
    pattern: /^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i,
    why: 'lockfile changes imply dependency change — human review required',
  },
];

export const SOFT_RULES = [
  {
    id: 'package-json-deps',
    kind: 'content',
    pattern: /^[+-]\s*"(dependencies|devDependencies|peerDependencies)"\s*:/m,
    fileMatch: /(^|\/)package\.json$/,
    why: 'package.json dependency stanza changed — human review required',
  },
  {
    id: 'large-diff-lines',
    kind: 'count',
    threshold: 500,
    why: 'diff exceeds 500 lines — likely too large for autonomous commit',
    metric: 'changedLines',
  },
  {
    id: 'large-diff-files',
    kind: 'count',
    threshold: 25,
    why: 'diff touches more than 25 files — likely too broad for autonomous commit',
    metric: 'changedFiles',
  },
  {
    id: 'mass-renames',
    kind: 'count',
    threshold: 5,
    why: 'more than 5 renames — refactor scope likely beyond a single AC',
    metric: 'renames',
  },
];

function run(bin, argv) {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function getDiff({ base, staged }) {
  if (staged) {
    const ns = run('git', ['diff', '--cached', '--name-status']);
    const u = run('git', ['diff', '--cached', '--unified=0']);
    return { nameStatus: ns.stdout, unified: u.stdout, code: ns.code };
  }
  const ns = run('git', ['diff', '--name-status', `${base}...HEAD`]);
  if (ns.code !== 0) {
    const fb = run('git', ['diff', '--name-status', base]);
    if (fb.code !== 0) return { code: 1, error: fb.stderr };
    const u = run('git', ['diff', '--unified=0', base]);
    return { nameStatus: fb.stdout, unified: u.stdout, code: 0 };
  }
  const u = run('git', ['diff', '--unified=0', `${base}...HEAD`]);
  return { nameStatus: ns.stdout, unified: u.stdout, code: 0 };
}

function parseNameStatus(text) {
  const files = [];
  let renames = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0];
    if (code.startsWith('R')) {
      renames++;
      files.push({ status: 'rename', from: parts[1], to: parts[2] });
    } else {
      files.push({ status: code, path: parts[1] });
    }
  }
  return { files, renames };
}

function countChangedLines(unified) {
  let n = 0;
  for (const line of unified.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+') || line.startsWith('-')) n++;
  }
  return n;
}

export function evaluateDiff({ files, renames, changedLines, unified }) {
  const violations = [];
  const allPaths = files.flatMap((f) => f.status === 'rename' ? [f.from, f.to] : [f.path]).filter(Boolean);

  for (const r of RULES) {
    for (const p of allPaths) {
      if (r.kind === 'path' && r.pattern.test(p)) {
        violations.push({ id: r.id, severity: 'hard', path: p, why: r.why });
      }
    }
  }

  for (const r of SOFT_RULES) {
    if (r.kind === 'count') {
      const value = r.metric === 'changedLines' ? changedLines
        : r.metric === 'changedFiles' ? files.length
        : r.metric === 'renames' ? renames : 0;
      if (value > r.threshold) {
        violations.push({ id: r.id, severity: 'hard', why: `${r.why} (${value} > ${r.threshold})` });
      }
    } else if (r.kind === 'content') {
      for (const p of allPaths) {
        if (r.fileMatch && !r.fileMatch.test(p)) continue;
        if (r.pattern.test(unified)) {
          violations.push({ id: r.id, severity: 'hard', path: p, why: r.why });
        }
      }
    }
  }

  return {
    files: files.length,
    renames,
    changedLines,
    violations,
    safe: violations.length === 0,
  };
}

function formatReport(report, { json }) {
  if (json) return JSON.stringify(report, null, 2);
  const lines = [];
  lines.push(c.bold(`\n=== task-guard ===`));
  lines.push(c.dim(`files: ${report.files}  renames: ${report.renames}  +/- lines: ${report.changedLines}`));
  if (report.safe) {
    lines.push(c.green('\n✓ no guard violations — diff is safe for autonomous commit.\n'));
  } else {
    lines.push(c.red(`\n✗ ${report.violations.length} guard violation(s):\n`));
    for (const v of report.violations) {
      const where = v.path ? ` ${c.dim('@ ' + v.path)}` : '';
      lines.push(`  ${c.red('✗')} [${v.id}] ${v.why}${where}`);
    }
    lines.push('');
    lines.push(c.yellow('Autonomous commit refused. Stop and ask Yume, or split the diff.'));
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const base = (() => {
    const i = args.indexOf('--base');
    return i !== -1 ? args[i + 1] : 'main';
  })();
  const staged = args.includes('--staged');
  const json = args.includes('--json');

  const diff = getDiff({ base, staged });
  if (diff.code !== 0) {
    console.error(c.red(`error: cannot read git diff: ${diff.error || 'unknown'}`));
    process.exit(2);
  }

  const { files, renames } = parseNameStatus(diff.nameStatus);
  const changedLines = countChangedLines(diff.unified);
  const report = evaluateDiff({ files, renames, changedLines, unified: diff.unified });

  console.log(formatReport(report, { json }));
  process.exit(report.safe ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
