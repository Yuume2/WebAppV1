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

export class ArgsError extends Error {
  constructor(message, { exitCode = 1, showUsage = false } = {}) {
    super(message);
    this.exitCode = exitCode;
    this.showUsage = showUsage;
  }
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

export const USAGE_LINES = [
  'usage: node tools/issue-status.mjs <issueNumber> <status>',
  `       status: ${VALID_STATUSES.map((s) => `"${s}"`).join(' | ')}`,
  'example: node tools/issue-status.mjs 27 "In Progress"',
];

function printUsage() {
  for (const line of USAGE_LINES) console.error(line);
}

function usage() {
  printUsage();
  process.exit(2);
}

export function parseArgsFrom(argv) {
  const positional = [];
  let flagStatus;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--status' || a === '-s') {
      flagStatus = argv[++i];
      continue;
    }
    if (a === '--help' || a === '-h') {
      throw new ArgsError('help', { exitCode: 2, showUsage: true });
    }
    if (a.startsWith('--')) throw new ArgsError(`unknown flag: ${a}`);
    positional.push(a);
  }
  if (positional.length === 0) {
    throw new ArgsError('missing arguments', { exitCode: 2, showUsage: true });
  }

  const issueNumber = Number.parseInt(positional[0], 10);
  if (!Number.isFinite(issueNumber) || issueNumber <= 0) {
    throw new ArgsError(
      `invalid issue number: "${positional[0]}"\n  hint: pass the issue number first. ${USAGE_LINES[0]}`,
    );
  }

  const status = (flagStatus ?? positional.slice(1).join(' ')).trim();
  if (!status) throw new ArgsError('missing status', { exitCode: 2, showUsage: true });
  if (!VALID_STATUSES.includes(status)) {
    throw new ArgsError(
      `invalid status: "${status}". Expected one of: ${VALID_STATUSES.join(', ')}`,
    );
  }
  return { issueNumber, status };
}

function parseArgs() {
  try {
    return parseArgsFrom(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ArgsError) {
      if (err.message !== 'help') console.error(c.red(`error: ${err.message}`));
      if (err.showUsage) printUsage();
      process.exit(err.exitCode);
    }
    throw err;
  }
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
