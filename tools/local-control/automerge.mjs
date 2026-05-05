import { spawnSync } from 'node:child_process';
import { isSensitivePath } from './safety.mjs';

const SMALL_DIFF_MAX_LINES = 400;
const SMALL_DIFF_MAX_FILES = 25;

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function ghJson(args) {
  const r = gh(args);
  if (r.code !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

export function fetchPrContext(pr) {
  const data = ghJson(['pr', 'view', String(pr), '--json',
    'number,state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,files,labels,headRefName,baseRefName,closingIssuesReferences,reviews,additions,deletions',
  ]);
  return data;
}
export function fetchIssueLabels(issueNumber) {
  const data = ghJson(['issue', 'view', String(issueNumber), '--json', 'labels,number,state']);
  return data;
}
export function fetchBranchProtection(repoNameWithOwner, branch) {
  const direct = gh(['api', `repos/${repoNameWithOwner}/branches/${branch}/protection`]);
  if (direct.code === 0) return { protected: true, source: 'classic' };
  const rulesets = ghJson(['api', `repos/${repoNameWithOwner}/rulesets`]);
  if (Array.isArray(rulesets) && rulesets.length) return { protected: true, source: 'ruleset' };
  return { protected: false, source: null };
}
export function runTaskGuard(repoRoot, headRef) {
  const r = spawnSync('node', ['tools/task-guard.mjs', '--base', `origin/${headRef ?? 'main'}`, '--json'], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0 && r.status !== 1) return { ok: false, allow: false, reason: 'guard error' };
  try {
    const j = JSON.parse(r.stdout);
    return { ok: true, allow: j.allow === true, violations: j.violations ?? [] };
  } catch {
    return { ok: false, allow: false, reason: 'guard parse error' };
  }
}

export function evaluateAutoMerge({ pr, settings, prData, issueLabels, branchProtection, guardResult, repoSensitivePathFn = isSensitivePath }) {
  const reasons = [];
  const checks = {
    ciGreen: false,
    linkedIssue: null,
    issueLabels: [],
    branchProtection: false,
    guardAllow: false,
    smallDiff: false,
    noSensitivePaths: false,
    noChangesRequested: false,
  };
  if (!settings?.allowAutoMerge) reasons.push('allowAutoMerge disabled in settings');
  if (!prData) { reasons.push('PR data unavailable'); return { pr, eligible: false, applied: false, reasons, checks }; }
  if (prData.state !== 'OPEN') reasons.push(`PR not OPEN (state=${prData.state})`);
  if (prData.isDraft) reasons.push('PR is draft');

  const rollup = Array.isArray(prData.statusCheckRollup) ? prData.statusCheckRollup : [];
  const failed = rollup.filter((c) => {
    const conc = c.conclusion ?? c.state ?? '';
    return ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(conc);
  });
  const pending = rollup.filter((c) => {
    const status = c.status ?? c.state ?? '';
    return ['IN_PROGRESS', 'QUEUED', 'PENDING', 'WAITING'].includes(status);
  });
  checks.ciGreen = rollup.length > 0 && failed.length === 0 && pending.length === 0;
  if (!checks.ciGreen) reasons.push('CI not green');

  const linked = Array.isArray(prData.closingIssuesReferences) ? prData.closingIssuesReferences[0] : null;
  checks.linkedIssue = linked?.number ?? null;
  if (!checks.linkedIssue) reasons.push('PR has no linked issue');

  const labels = (issueLabels?.labels ?? []).map((l) => l.name);
  checks.issueLabels = labels;
  if (!labels.includes('ai:autonomous')) reasons.push('issue missing ai:autonomous label');
  if (!labels.includes('risk:safe')) reasons.push('issue missing risk:safe label');

  checks.branchProtection = !!branchProtection?.protected;
  if (!checks.branchProtection) reasons.push('branch protection not detected');

  checks.guardAllow = !!guardResult?.allow;
  if (!checks.guardAllow) reasons.push('task-guard did not ALLOW');

  const files = Array.isArray(prData.files) ? prData.files : [];
  const totalLines = (prData.additions ?? 0) + (prData.deletions ?? 0);
  checks.smallDiff = files.length <= SMALL_DIFF_MAX_FILES && totalLines <= SMALL_DIFF_MAX_LINES;
  if (!checks.smallDiff) reasons.push(`diff too large (${files.length} files, ${totalLines} lines)`);

  const sensitiveHits = files.map((f) => f.path).filter((p) => p && repoSensitivePathFn(p));
  checks.noSensitivePaths = sensitiveHits.length === 0;
  if (!checks.noSensitivePaths) reasons.push(`sensitive paths touched: ${sensitiveHits.slice(0, 3).join(', ')}`);

  const reviews = Array.isArray(prData.reviews) ? prData.reviews : [];
  const changesRequested = reviews.some((r) => r.state === 'CHANGES_REQUESTED');
  checks.noChangesRequested = !changesRequested;
  if (changesRequested) reasons.push('a reviewer requested changes');

  const eligible = reasons.length === 0;
  return { pr, eligible, applied: false, reasons, checks };
}

export function applyAutoMerge(pr) {
  const r = gh(['pr', 'merge', String(pr), '--squash', '--delete-branch']);
  return { ok: r.code === 0, stdout: r.stdout, stderr: r.stderr };
}
