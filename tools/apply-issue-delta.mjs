#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BACKLOG_PATH = resolve(REPO_ROOT, 'project-memory/backlog/issues.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const YES = args.includes('--yes');
const fileArg = (() => {
  const i = args.findIndex((a) => a === '--file' || a === '-f');
  if (i !== -1 && args[i + 1]) return args[i + 1];
  const pos = args.find((a) => !a.startsWith('-'));
  return pos;
})();

const MAX_NEW = 5;
const VALID_OWNERS = new Set(['L', 'E', 'X']);
const VALID_STATUS = new Set(['Backlog', 'Ready']);
const VALID_PRIORITY = new Set(['P0-now', 'P1-week', 'P2-soon', 'P3-backlog']);

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};
function die(msg) { console.error(c.red(`error: ${msg}`)); process.exit(1); }
function reject(msg) { console.error(c.red(`REJECT: ${msg}`)); process.exit(3); }

function runCapture(bin, argv) {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function ghJson(argv) {
  const r = runCapture('gh', argv);
  if (r.code !== 0) die(`gh ${argv.join(' ')}\n${r.stderr}`);
  try { return JSON.parse(r.stdout); } catch (e) { die(`could not parse gh output: ${e.message}`); }
}

// ── Preflight ─────────────────────────────────────────────────────────────────

function preflight() {
  if (runCapture('which', ['gh']).code !== 0) die('gh CLI not found');
  const auth = runCapture('gh', ['auth', 'status']);
  if (auth.code !== 0) die('not authenticated (gh auth login)');
  const scopes = `${auth.stdout}\n${auth.stderr}`;
  if (!/\brepo\b/.test(scopes)) die('missing `repo` scope — run: gh auth refresh -s repo');
  if (!/\bproject\b/.test(scopes)) die('missing `project` scope — run: gh auth refresh -s project');
}

// ── Resolve file ──────────────────────────────────────────────────────────────

function resolveDeltaPath() {
  const fallback = resolve(REPO_ROOT, 'project-memory/backlog/issues.delta.json');
  let p;
  if (fileArg) p = isAbsolute(fileArg) ? fileArg : resolve(process.cwd(), fileArg);
  else p = fallback;
  if (!existsSync(p)) {
    die(`delta file not found: ${p}\nprovide one with: --file <path>  (default: ${fallback})`);
  }
  return p;
}

// ── Validate delta ────────────────────────────────────────────────────────────

function validateDelta(delta, repoLabels, projectFields) {
  if (!delta || typeof delta !== 'object') reject('delta root is not an object');
  if (!delta.project?.projectOwnerLogin || !delta.project?.projectNumber) {
    reject('delta.project.projectOwnerLogin and projectNumber required');
  }
  const backlog = JSON.parse(readFileSync(BACKLOG_PATH, 'utf8'));
  if (delta.project.projectOwnerLogin !== backlog.project.projectOwnerLogin) {
    reject(`projectOwnerLogin mismatch with issues.json (${backlog.project.projectOwnerLogin})`);
  }
  if (Number(delta.project.projectNumber) !== Number(backlog.project.projectNumber)) {
    reject(`projectNumber mismatch with issues.json (${backlog.project.projectNumber})`);
  }
  if (!delta.context?.sourceIssue) reject('context.sourceIssue required');
  if (!Array.isArray(delta.issues)) reject('issues must be an array');
  if (delta.issues.length === 0) reject('issues array is empty');
  if (delta.issues.length > MAX_NEW) reject(`agent delta exceeds hard cap (${delta.issues.length} > ${MAX_NEW})`);

  const seenKeys = new Set();
  const seenTitles = new Set();

  for (const [i, it] of delta.issues.entries()) {
    const where = `issues[${i}]`;
    for (const k of ['externalKey', 'title', 'body', 'labels', 'owner', 'area', 'priority', 'status', 'sourceIssue', 'reason']) {
      if (it[k] === undefined || it[k] === null) reject(`${where}.${k} missing`);
    }
    if (!Array.isArray(it.labels) || it.labels.length === 0) reject(`${where}.labels must be non-empty array`);
    if (!VALID_OWNERS.has(it.owner)) reject(`${where}.owner invalid: ${it.owner}`);
    if (!VALID_STATUS.has(it.status)) reject(`${where}.status invalid (only Backlog/Ready): ${it.status}`);
    if (!VALID_PRIORITY.has(it.priority)) reject(`${where}.priority invalid: ${it.priority}`);

    if (seenKeys.has(it.externalKey)) reject(`${where}.externalKey duplicated in delta: ${it.externalKey}`);
    seenKeys.add(it.externalKey);
    if (seenTitles.has(it.title)) reject(`${where}.title duplicated in delta: ${it.title}`);
    seenTitles.add(it.title);

    for (const l of it.labels) if (!repoLabels.has(l)) reject(`${where}.labels: unknown repo label "${l}"`);

    if (!projectFields.Owner?.options[it.owner])     reject(`${where}.owner: no Project option "${it.owner}"`);
    if (!projectFields.Area?.options[it.area])       reject(`${where}.area: no Project option "${it.area}"`);
    if (!projectFields.Status?.options[it.status])   reject(`${where}.status: no Project option "${it.status}"`);
    if (!projectFields.Priority?.options[it.priority]) reject(`${where}.priority: no Project option "${it.priority}"`);

    if (it.dependsOn !== undefined && !Array.isArray(it.dependsOn)) reject(`${where}.dependsOn must be array if present`);
  }
}

// ── Repo / project state ──────────────────────────────────────────────────────

function detectRepo() {
  const j = ghJson(['repo', 'view', '--json', 'nameWithOwner,owner,name']);
  return { nameWithOwner: j.nameWithOwner, ownerLogin: j.owner?.login, name: j.name };
}

function fetchLabels(repo) {
  const j = ghJson(['label', 'list', '--repo', repo.nameWithOwner, '--limit', '200', '--json', 'name']);
  return new Set(j.map((x) => x.name));
}

function fetchExistingIssueTitles(repo) {
  const j = ghJson(['issue', 'list', '--repo', repo.nameWithOwner, '--state', 'all', '--limit', '500', '--json', 'title,number,state,body']);
  const byTitle = new Map();
  const keyedBodies = [];
  for (const i of j) {
    byTitle.set(i.title, i);
    keyedBodies.push({ number: i.number, body: i.body ?? '' });
  }
  return { byTitle, keyedBodies };
}

function fetchProjectFields(projectNumber, owner) {
  const j = ghJson(['project', 'field-list', String(projectNumber), '--owner', owner, '--format', 'json']);
  const out = {};
  for (const name of ['Owner', 'Area', 'Status', 'Priority']) {
    const f = (j.fields ?? []).find((x) => x.name === name && x.type === 'ProjectV2SingleSelectField');
    if (!f) { out[name] = null; continue; }
    const options = {};
    for (const o of f.options ?? []) options[o.name] = o.id;
    out[name] = { id: f.id, options };
  }
  return out;
}

function fetchProjectId(projectNumber, owner) {
  const j = ghJson(['project', 'view', String(projectNumber), '--owner', owner, '--format', 'json']);
  return j.id;
}

function fetchProjectItems(projectNumber, owner) {
  const j = ghJson(['project', 'item-list', String(projectNumber), '--owner', owner, '--format', 'json', '--limit', '500']);
  return j.items ?? [];
}

// ── Actions ───────────────────────────────────────────────────────────────────

function createIssue(issue, repo) {
  const tmp = mkdtempSync(join(tmpdir(), 'delta-body-'));
  const bodyFile = join(tmp, 'body.md');
  const bodyWithKey = `${issue.body}\n\n<!-- externalKey: ${issue.externalKey} -->\n<!-- sourceIssue: ${issue.sourceIssue} -->\n`;
  writeFileSync(bodyFile, bodyWithKey);
  const argv = ['issue', 'create', '--repo', repo.nameWithOwner, '--title', issue.title, '--body-file', bodyFile];
  for (const l of issue.labels) { argv.push('--label', l); }
  const r = runCapture('gh', argv);
  rmSync(tmp, { recursive: true, force: true });
  if (r.code !== 0) return { ok: false, err: r.stderr || r.stdout };
  return { ok: true, url: r.stdout.trim().split('\n').pop() };
}

function addToProject(projectNumber, projectOwnerLogin, issueUrl) {
  const r = runCapture('gh', ['project', 'item-add', String(projectNumber), '--owner', projectOwnerLogin, '--url', issueUrl, '--format', 'json']);
  if (r.code !== 0) return { ok: false, err: r.stderr || r.stdout };
  try { return { ok: true, itemId: JSON.parse(r.stdout).id }; } catch { return { ok: true, itemId: null }; }
}

function setSingleSelect(projectId, itemId, fieldId, optionId) {
  const r = runCapture('gh', ['project', 'item-edit', '--project-id', projectId, '--id', itemId, '--field-id', fieldId, '--single-select-option-id', optionId]);
  if (r.code !== 0) return { ok: false, err: r.stderr || r.stdout };
  return { ok: true };
}

function resolveItemId(projectNumber, owner, title) {
  const items = fetchProjectItems(projectNumber, owner);
  const hit = items.find((x) => (x.title ?? x.content?.title) === title);
  return hit?.id ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  preflight();
  const path = resolveDeltaPath();
  const delta = JSON.parse(readFileSync(path, 'utf8'));
  const repo = detectRepo();
  const labels = fetchLabels(repo);
  const projectFields = fetchProjectFields(delta.project.projectNumber, delta.project.projectOwnerLogin);

  validateDelta(delta, labels, projectFields);

  const { byTitle, keyedBodies } = fetchExistingIssueTitles(repo);
  const duplicates = [];
  const toCreate = [];
  for (const it of delta.issues) {
    const titleHit = byTitle.get(it.title);
    const keyHit = keyedBodies.find((b) => b.body.includes(`externalKey: ${it.externalKey}`));
    if (titleHit)    { duplicates.push({ issue: it, reason: `title exists as #${titleHit.number}` }); continue; }
    if (keyHit)      { duplicates.push({ issue: it, reason: `externalKey exists in #${keyHit.number}` }); continue; }
    toCreate.push(it);
  }

  console.log(c.cyan(`repo:       ${repo.nameWithOwner}`));
  console.log(c.cyan(`project:    ${delta.project.projectOwnerLogin} #${delta.project.projectNumber}`));
  console.log(c.cyan(`delta:      ${path}`));
  console.log(c.cyan(`source:     issue #${delta.context.sourceIssue}  branch=${delta.context.sourceBranch ?? '∅'}  pr=${delta.context.sourcePr ?? '∅'}`));
  console.log(c.cyan(`mode:       ${DRY_RUN ? 'DRY-RUN' : 'REAL APPLY'}`));
  console.log(c.yellow(`to create:  ${toCreate.length}   duplicates: ${duplicates.length}   cap: ${MAX_NEW}`));
  console.log('');

  if (DRY_RUN) {
    for (const it of toCreate) {
      console.log(`${c.green('+')} ${it.title}`);
      console.log(c.dim(`    externalKey=${it.externalKey}  owner=${it.owner}  area=${it.area}  priority=${it.priority}  status=${it.status}`));
      console.log(c.dim(`    labels: ${it.labels.join(', ')}`));
      console.log(c.dim(`    reason: ${it.reason}`));
    }
    for (const d of duplicates) console.log(`${c.dim('=')} ${c.dim(d.issue.title)} ${c.dim(`(${d.reason})`)}`);
    console.log('');
    console.log(c.cyan('dry-run complete. no issues created. no project changes.'));
    return;
  }

  if (!YES) { console.log(c.red('refusing to apply without --yes flag')); process.exit(2); }
  if (toCreate.length === 0) { console.log(c.yellow('nothing to create.')); return; }

  const projectId = fetchProjectId(delta.project.projectNumber, delta.project.projectOwnerLogin);
  const created = [];
  const failed = [];

  for (const it of toCreate) {
    process.stdout.write(`creating: ${it.title} ... `);
    const mk = createIssue(it, repo);
    if (!mk.ok) { console.log(c.red('FAIL')); console.error(c.red(mk.err)); failed.push({ title: it.title, stage: 'create', err: mk.err }); continue; }
    console.log(c.green(mk.url));

    const add = addToProject(delta.project.projectNumber, delta.project.projectOwnerLogin, mk.url);
    let itemId = add.ok ? add.itemId : null;
    if (!itemId) itemId = resolveItemId(delta.project.projectNumber, delta.project.projectOwnerLogin, it.title);
    if (!itemId) {
      console.log(c.red('  project item-add did not return id; aborting field-fill for this issue'));
      failed.push({ title: it.title, stage: 'project-add', err: add.err ?? 'no itemId' });
      continue;
    }

    const ops = [
      { label: 'Owner',    fid: projectFields.Owner.id,    oid: projectFields.Owner.options[it.owner] },
      { label: 'Area',     fid: projectFields.Area.id,     oid: projectFields.Area.options[it.area] },
      { label: 'Status',   fid: projectFields.Status.id,   oid: projectFields.Status.options[it.status] },
      { label: 'Priority', fid: projectFields.Priority.id, oid: projectFields.Priority.options[it.priority] },
    ];
    for (const op of ops) {
      const r = setSingleSelect(projectId, itemId, op.fid, op.oid);
      if (r.ok) console.log(c.dim(`  ✓ ${op.label}`));
      else      { console.log(c.red(`  ✗ ${op.label}: ${r.err?.trim()}`)); failed.push({ title: it.title, stage: `field:${op.label}`, err: r.err }); }
    }
    created.push({ title: it.title, url: mk.url });
  }

  console.log('');
  console.log(c.cyan(`created: ${created.length}  failed-ops: ${failed.length}  duplicates: ${duplicates.length}`));
  if (failed.length) { console.log(c.red('failures:')); for (const f of failed) console.log(`  - [${f.stage}] ${f.title}`); }
}

main();
