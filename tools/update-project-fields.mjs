#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BACKLOG_PATH = resolve(REPO_ROOT, 'project-memory/backlog/issues.json');

const DRY_RUN = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function die(msg) { console.error(c.red(`error: ${msg}`)); process.exit(1); }

function runCapture(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function ghJson(args) {
  const r = runCapture('gh', args);
  if (r.code !== 0) die(`gh ${args.join(' ')}\n${r.stderr}`);
  try { return JSON.parse(r.stdout); }
  catch (e) { die(`could not parse gh output: ${e.message}`); }
}

// ── Preflight ─────────────────────────────────────────────────────────────────

function preflight() {
  const which = runCapture('which', ['gh']);
  if (which.code !== 0) die('gh CLI not found');
  const auth = runCapture('gh', ['auth', 'status']);
  if (auth.code !== 0) die('not authenticated (gh auth login)');
  const scopes = `${auth.stdout}\n${auth.stderr}`;
  if (!/\bproject\b/.test(scopes)) die('missing `project` scope — run: gh auth refresh -s project');
}

// ── Load backlog ──────────────────────────────────────────────────────────────

function loadBacklog() {
  const data = JSON.parse(readFileSync(BACKLOG_PATH, 'utf8'));
  if (!data.project?.projectNumber || !data.project?.projectOwnerLogin) {
    die('issues.json: project.projectNumber / projectOwnerLogin required');
  }
  return data;
}

// ── Load project fields ───────────────────────────────────────────────────────

const OWNER_MAP = { L: 'L', E: 'E', X: 'X' };
const AREA_MAP  = { api: 'api', web: 'web', memory: 'memory', 'packages-types': 'packages-types', ci: 'ci' };

function buildFieldIndex(projectNumber, owner) {
  const j = ghJson(['project', 'field-list', String(projectNumber), '--owner', owner, '--format', 'json']);
  const fields = j.fields ?? [];
  const lookup = {};
  for (const name of ['Owner', 'Area', 'Status', 'Priority']) {
    const f = fields.find((x) => x.name === name && x.type === 'ProjectV2SingleSelectField');
    if (!f) { lookup[name] = null; continue; }
    const opts = {};
    for (const o of f.options ?? []) opts[o.name] = o.id;
    lookup[name] = { id: f.id, options: opts };
  }
  return lookup;
}

function getProjectId(projectNumber, owner) {
  const j = ghJson(['project', 'view', String(projectNumber), '--owner', owner, '--format', 'json']);
  if (!j.id) die('could not resolve project id');
  return j.id;
}

function listProjectItems(projectNumber, owner) {
  const j = ghJson(['project', 'item-list', String(projectNumber), '--owner', owner, '--format', 'json', '--limit', '500']);
  return j.items ?? [];
}

// ── Match item by issue title ─────────────────────────────────────────────────

function indexItemsByTitle(items) {
  const map = new Map();
  for (const it of items) {
    const title = it.title ?? it.content?.title;
    if (title) map.set(title, it);
  }
  return map;
}

// ── Apply field ───────────────────────────────────────────────────────────────

function setSingleSelect({ projectId, itemId, fieldId, optionId }) {
  const r = runCapture('gh', [
    'project', 'item-edit',
    '--project-id', projectId,
    '--id', itemId,
    '--field-id', fieldId,
    '--single-select-option-id', optionId,
  ]);
  if (r.code !== 0) return { ok: false, err: r.stderr || r.stdout };
  return { ok: true };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  preflight();
  const data = loadBacklog();
  const { projectNumber, projectOwnerLogin } = data.project;

  console.log(c.cyan(`project:  ${projectOwnerLogin} #${projectNumber}`));
  console.log(c.cyan(`mode:     ${DRY_RUN ? 'DRY-RUN' : 'REAL UPDATE'}`));

  const projectId = getProjectId(projectNumber, projectOwnerLogin);
  const fields = buildFieldIndex(projectNumber, projectOwnerLogin);

  console.log('');
  console.log(c.cyan('fields detected:'));
  for (const [name, f] of Object.entries(fields)) {
    if (!f) { console.log(c.yellow(`  ${name}: NOT FOUND (will skip)`)); continue; }
    console.log(c.dim(`  ${name}: ${f.id} — options: ${Object.keys(f.options).join(', ')}`));
  }
  console.log('');

  const items = listProjectItems(projectNumber, projectOwnerLogin);
  const byTitle = indexItemsByTitle(items);
  console.log(c.dim(`items in project: ${items.length}`));

  const plan = [];
  const notFound = [];
  const areaSkipped = [];

  for (const issue of data.issues) {
    const item = byTitle.get(issue.title);
    if (!item) { notFound.push(issue.title); continue; }

    const ops = [];

    if (fields.Owner) {
      const optName = OWNER_MAP[issue.owner];
      const optId = optName && fields.Owner.options[optName];
      if (optId) ops.push({ field: 'Owner', fieldId: fields.Owner.id, optionId: optId, value: optName });
    }
    if (fields.Area) {
      const optName = AREA_MAP[issue.area];
      const optId = optName && fields.Area.options[optName];
      if (optId) ops.push({ field: 'Area', fieldId: fields.Area.id, optionId: optId, value: optName });
      else areaSkipped.push({ title: issue.title, area: issue.area });
    }
    if (fields.Status) {
      const optId = fields.Status.options[issue.status];
      if (optId) ops.push({ field: 'Status', fieldId: fields.Status.id, optionId: optId, value: issue.status });
    }
    if (fields.Priority) {
      const optId = fields.Priority.options[issue.priority];
      if (optId) ops.push({ field: 'Priority', fieldId: fields.Priority.id, optionId: optId, value: issue.priority });
    }

    plan.push({ issue, itemId: item.id, ops });
  }

  console.log(c.yellow(`planned updates: ${plan.length} items, ${plan.reduce((a, p) => a + p.ops.length, 0)} field operations`));
  if (notFound.length)    console.log(c.yellow(`not in project: ${notFound.length}`));
  if (areaSkipped.length) console.log(c.yellow(`area skipped (no matching option): ${areaSkipped.length}`));
  console.log('');

  if (DRY_RUN) {
    for (const p of plan) {
      console.log(`${c.green('•')} ${p.issue.title}`);
      for (const o of p.ops) console.log(c.dim(`    ${o.field} = ${o.value}`));
    }
    if (notFound.length)    { console.log(''); console.log(c.yellow('NOT IN PROJECT:')); notFound.forEach((t) => console.log(c.dim(`  - ${t}`))); }
    if (areaSkipped.length) { console.log(''); console.log(c.yellow('AREA WITHOUT MATCHING PROJECT OPTION:')); areaSkipped.forEach((x) => console.log(c.dim(`  - [${x.area}] ${x.title}`))); console.log(c.dim('  → add option(s) to Area field in the Project UI to fix.')); }
    console.log('');
    console.log(c.cyan('dry-run complete. nothing changed.'));
    return;
  }

  if (!YES) { console.log(c.red('refusing to update without --yes flag')); process.exit(2); }

  let okOps = 0, failOps = 0;
  for (const p of plan) {
    process.stdout.write(`${p.issue.title}\n`);
    for (const o of p.ops) {
      const r = setSingleSelect({ projectId, itemId: p.itemId, fieldId: o.fieldId, optionId: o.optionId });
      if (r.ok) { console.log(c.dim(`  ✓ ${o.field} = ${o.value}`)); okOps++; }
      else      { console.log(c.red(`  ✗ ${o.field} = ${o.value} — ${r.err?.trim()}`)); failOps++; }
    }
  }

  console.log('');
  console.log(c.cyan(`field ops ok: ${okOps}  failed: ${failOps}`));
  if (areaSkipped.length) console.log(c.yellow(`area skipped: ${areaSkipped.length} (add missing Area options in Project UI)`));
  if (notFound.length)    console.log(c.yellow(`not in project: ${notFound.length}`));
}

main();
