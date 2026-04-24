#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BACKLOG_PATH = resolve(REPO_ROOT, 'project-memory/backlog/issues.json');

const DRY_RUN = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');

const color = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function die(msg) {
  console.error(color.red(`error: ${msg}`));
  process.exit(1);
}

function runCapture(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function runStream(bin, args) {
  const r = spawnSync(bin, args, { stdio: 'inherit' });
  return r.status ?? 1;
}

// ── Preflight ─────────────────────────────────────────────────────────────────

function preflight() {
  const which = runCapture('which', ['gh']);
  if (which.code !== 0 || !which.stdout.trim()) {
    die('GitHub CLI (`gh`) not found. Install: https://cli.github.com/');
  }

  const auth = runCapture('gh', ['auth', 'status']);
  if (auth.code !== 0) {
    console.error(auth.stderr || auth.stdout);
    die('Not authenticated. Run: gh auth login');
  }

  const combined = `${auth.stdout}\n${auth.stderr}`;
  const scopeLine = combined.split('\n').find((l) => /Token scopes:/i.test(l)) ?? '';
  const hasRepo    = /\brepo\b/.test(scopeLine);
  const hasProject = /\bproject\b|\bread:project\b/.test(scopeLine);

  if (!hasRepo) {
    die('gh token missing `repo` scope. Run: gh auth refresh -s repo');
  }
  return { hasProject, scopeLine };
}

// ── Load backlog ──────────────────────────────────────────────────────────────

function loadBacklog() {
  let raw;
  try { raw = readFileSync(BACKLOG_PATH, 'utf8'); }
  catch { die(`cannot read ${BACKLOG_PATH}`); }

  let data;
  try { data = JSON.parse(raw); }
  catch (e) { die(`invalid JSON in issues.json: ${e.message}`); }

  if (!Array.isArray(data.issues)) die('issues.json: `issues` array missing');
  data.issues.forEach((it, i) => {
    for (const k of ['title', 'body', 'labels', 'owner', 'area', 'priority', 'status']) {
      if (it[k] === undefined) die(`issue[${i}] missing field: ${k}`);
    }
    if (!Array.isArray(it.labels)) die(`issue[${i}] labels must be array`);
  });
  return data;
}

// ── Repo detection ────────────────────────────────────────────────────────────

function detectRepo() {
  const r = runCapture('gh', ['repo', 'view', '--json', 'nameWithOwner,owner,name']);
  if (r.code !== 0) die('not inside a GitHub repo (or `gh repo view` failed)');
  try {
    const parsed = JSON.parse(r.stdout);
    return {
      nameWithOwner: parsed.nameWithOwner,
      ownerLogin: parsed.owner?.login ?? parsed.nameWithOwner.split('/')[0],
      name: parsed.name,
    };
  } catch {
    die('could not parse `gh repo view` output');
  }
}

// ── Existing issues (for dedupe) ──────────────────────────────────────────────

function fetchExistingTitles(repo) {
  const r = runCapture('gh', [
    'issue', 'list',
    '--repo', repo.nameWithOwner,
    '--state', 'all',
    '--limit', '500',
    '--json', 'title,number,state',
  ]);
  if (r.code !== 0) die(`gh issue list failed: ${r.stderr}`);
  try {
    const arr = JSON.parse(r.stdout);
    return new Map(arr.map((i) => [i.title, i]));
  } catch {
    die('could not parse issue list');
  }
}

// ── Project handling ──────────────────────────────────────────────────────────

function addToProject(projectSpec, issueUrl, hasProject) {
  if (!projectSpec?.projectNumber || !projectSpec?.projectOwnerLogin) return { skipped: true, reason: 'not configured' };
  if (!hasProject) return { skipped: true, reason: 'missing `project` scope — run: gh auth refresh -s project' };

  const r = runCapture('gh', [
    'project', 'item-add',
    String(projectSpec.projectNumber),
    '--owner', projectSpec.projectOwnerLogin,
    '--url', issueUrl,
  ]);
  if (r.code !== 0) return { skipped: false, ok: false, err: r.stderr || r.stdout };
  return { skipped: false, ok: true };
}

// ── Create one issue ──────────────────────────────────────────────────────────

function createIssue(issue, repo) {
  const tmp = mkdtempSync(join(tmpdir(), 'issue-body-'));
  const bodyFile = join(tmp, 'body.md');
  writeFileSync(bodyFile, issue.body);

  const args = [
    'issue', 'create',
    '--repo', repo.nameWithOwner,
    '--title', issue.title,
    '--body-file', bodyFile,
  ];
  for (const l of issue.labels) { args.push('--label', l); }

  const r = runCapture('gh', args);
  rmSync(tmp, { recursive: true, force: true });
  if (r.code !== 0) return { ok: false, err: r.stderr || r.stdout };

  const url = r.stdout.trim().split('\n').pop();
  return { ok: true, url };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const { hasProject, scopeLine } = preflight();
  const data = loadBacklog();
  const repo = detectRepo();

  console.log(color.cyan(`repo:     ${repo.nameWithOwner}`));
  console.log(color.cyan(`backlog:  ${data.issues.length} issues in issues.json`));
  console.log(color.dim(`scopes:   ${scopeLine.trim() || '(unknown)'}`));
  console.log(color.cyan(`mode:     ${DRY_RUN ? 'DRY-RUN' : 'REAL CREATE'}`));
  console.log('');

  const existing = fetchExistingTitles(repo);
  const toCreate = [];
  const duplicates = [];

  for (const issue of data.issues) {
    if (existing.has(issue.title)) {
      duplicates.push({ issue, existing: existing.get(issue.title) });
    } else {
      toCreate.push(issue);
    }
  }

  console.log(color.yellow(`to create: ${toCreate.length}`));
  console.log(color.dim(`skip (duplicate title): ${duplicates.length}`));
  console.log('');

  if (DRY_RUN) {
    for (const it of toCreate) {
      console.log(`${color.green('+')} ${it.title}`);
      console.log(color.dim(`  labels: ${it.labels.join(', ')}`));
      console.log(color.dim(`  owner=${it.owner} area=${it.area} priority=${it.priority} status=${it.status}`));
    }
    for (const d of duplicates) {
      console.log(`${color.dim('=')} ${color.dim(d.issue.title)} ${color.dim(`(exists #${d.existing.number} ${d.existing.state})`)}`);
    }
    console.log('');
    console.log(color.cyan('dry-run complete. no issues were created.'));
    printProjectFollowUp(data.project, hasProject);
    return;
  }

  if (!YES) {
    console.log(color.red('refusing to create issues without --yes flag.'));
    console.log(color.dim('re-run: node tools/create-github-issues.mjs --yes'));
    process.exit(2);
  }

  const created = [];
  const failed = [];
  for (const it of toCreate) {
    process.stdout.write(`creating: ${it.title} ... `);
    const r = createIssue(it, repo);
    if (!r.ok) {
      console.log(color.red('FAIL'));
      console.error(color.red(r.err));
      failed.push({ issue: it, err: r.err });
      continue;
    }
    console.log(color.green(r.url));
    const proj = addToProject(data.project, r.url, hasProject);
    if (!proj.skipped && !proj.ok) {
      console.log(color.yellow(`  project add failed: ${proj.err?.trim()}`));
    } else if (proj.skipped) {
      // silent in real mode; printed once in follow-up
    } else {
      console.log(color.dim(`  added to project #${data.project.projectNumber}`));
    }
    created.push({ issue: it, url: r.url });
  }

  console.log('');
  console.log(color.cyan(`created: ${created.length}  failed: ${failed.length}  duplicates: ${duplicates.length}`));
  if (failed.length) {
    console.log(color.red('failures:'));
    for (const f of failed) console.log(` - ${f.issue.title}`);
  }
  printProjectFollowUp(data.project, hasProject);
}

function printProjectFollowUp(projectSpec, hasProject) {
  console.log('');
  console.log(color.cyan('--- project follow-up ---'));
  if (!projectSpec?.projectNumber || !projectSpec?.projectOwnerLogin) {
    console.log(color.yellow('project not configured in issues.json (projectNumber/projectOwnerLogin are null).'));
    console.log('to enable auto-add: set those fields, then re-run.');
  } else if (!hasProject) {
    console.log(color.yellow('missing `project` scope on gh token.'));
    console.log(color.green('  gh auth refresh -s project'));
  } else {
    console.log(color.dim(`issues auto-added to project #${projectSpec.projectNumber} (owner: ${projectSpec.projectOwnerLogin}).`));
  }
  console.log('');
  console.log(color.dim('custom fields (Owner / Area / Status) are NOT auto-filled.'));
  console.log(color.dim('to fill them, run once:'));
  console.log(color.dim('  gh project field-list <number> --owner <owner> --format json'));
  console.log(color.dim('then map field+option ids and `gh project item-edit --id <itemId> --field-id <f> --single-select-option-id <o>`.'));
}

main();
