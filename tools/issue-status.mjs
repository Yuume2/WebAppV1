#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BACKLOG_PATH = resolve(REPO_ROOT, 'project-memory/backlog/issues.json');

const VALID_STATUSES = ['Backlog', 'Ready', 'In Progress', 'Blocked', 'Review', 'Done'];

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function die(msg, code = 1) {
  console.error(c.red(`error: ${msg}`));
  process.exit(code);
}

function runCapture(bin, argv) {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function ghJson(argv) {
  const r = runCapture('gh', argv);
  if (r.code !== 0) die(`gh ${argv.join(' ')}\n${r.stderr || r.stdout}`);
  try { return JSON.parse(r.stdout); }
  catch (e) { die(`cannot parse gh output for \`gh ${argv.join(' ')}\`: ${e.message}`); }
}

function usage() {
  console.error('usage: node tools/issue-status.mjs <issueNumber> <status>');
  console.error(`       status: ${VALID_STATUSES.map((s) => `"${s}"`).join(' | ')}`);
  console.error('example: node tools/issue-status.mjs 27 "In Progress"');
  process.exit(2);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const positional = [];
  let flagStatus;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--status' || a === '-s') {
      flagStatus = args[++i];
      continue;
    }
    if (a === '--help' || a === '-h') usage();
    if (a.startsWith('--')) die(`unknown flag: ${a}`);
    positional.push(a);
  }
  if (positional.length === 0) usage();

  const issueNumber = Number.parseInt(positional[0], 10);
  if (!Number.isFinite(issueNumber) || issueNumber <= 0) {
    die(`invalid issue number: "${positional[0]}"`);
  }

  const status = (flagStatus ?? positional.slice(1).join(' ')).trim();
  if (!status) usage();
  if (!VALID_STATUSES.includes(status)) {
    die(`invalid status: "${status}". Expected one of: ${VALID_STATUSES.join(', ')}`);
  }
  return { issueNumber, status };
}

function preflight() {
  if (runCapture('which', ['gh']).code !== 0) die('gh CLI not found');
  const auth = runCapture('gh', ['auth', 'status']);
  if (auth.code !== 0) die('not authenticated (run: gh auth login)');
  const scopes = `${auth.stdout}\n${auth.stderr}`;
  if (!/\bproject\b/.test(scopes)) die('missing `project` scope — run: gh auth refresh -s project');
}

function loadProjectCoords() {
  let raw;
  try { raw = readFileSync(BACKLOG_PATH, 'utf8'); }
  catch { die(`cannot read ${BACKLOG_PATH}`); }
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { die(`invalid JSON in issues.json: ${e.message}`); }
  const owner = data?.project?.projectOwnerLogin;
  const number = data?.project?.projectNumber;
  if (!owner || !Number.isFinite(number)) {
    die('issues.json must expose project.projectOwnerLogin and project.projectNumber');
  }
  return { owner, number };
}

function getProjectId(number, owner) {
  const j = ghJson(['project', 'view', String(number), '--owner', owner, '--format', 'json']);
  if (!j.id) die('could not resolve project id');
  return j.id;
}

function getStatusField(number, owner) {
  const j = ghJson(['project', 'field-list', String(number), '--owner', owner, '--format', 'json']);
  const field = (j.fields ?? []).find(
    (x) => x.name === 'Status' && x.type === 'ProjectV2SingleSelectField',
  );
  if (!field) die('project has no single-select "Status" field');
  return field;
}

function findItemIdForIssue(number, owner, issueNumber) {
  const j = ghJson([
    'project', 'item-list', String(number),
    '--owner', owner, '--format', 'json', '--limit', '500',
  ]);
  const match = (j.items ?? []).find((it) => {
    const content = it.content;
    if (!content) return false;
    if (content.type && content.type !== 'Issue') return false;
    if (typeof content.number === 'number') return content.number === issueNumber;
    if (typeof content.url === 'string') return content.url.endsWith(`/issues/${issueNumber}`);
    return false;
  });
  return match?.id ?? null;
}

function setStatus(projectId, itemId, fieldId, optionId) {
  const r = runCapture('gh', [
    'project', 'item-edit',
    '--project-id', projectId,
    '--id', itemId,
    '--field-id', fieldId,
    '--single-select-option-id', optionId,
  ]);
  if (r.code !== 0) die(`gh project item-edit failed:\n${r.stderr || r.stdout}`);
}

function main() {
  const { issueNumber, status } = parseArgs();
  preflight();

  const { owner, number } = loadProjectCoords();
  console.log(c.cyan(`Setting issue #${issueNumber} → ${status}`));
  console.log(c.dim(`  project: ${owner} #${number}`));

  const projectId = getProjectId(number, owner);
  const field = getStatusField(number, owner);

  const option = (field.options ?? []).find((o) => o.name === status);
  if (!option) {
    die(
      `project Status field has no option "${status}". Available: ${(field.options ?? []).map((o) => o.name).join(', ')}`,
    );
  }

  const itemId = findItemIdForIssue(number, owner, issueNumber);
  if (!itemId) {
    die(`issue #${issueNumber} is not in project ${owner}#${number} — add it before updating its Status`);
  }

  setStatus(projectId, itemId, field.id, option.id);
  console.log(c.green('Done'));
}

main();
