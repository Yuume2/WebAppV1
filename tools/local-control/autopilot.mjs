import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { redactSecrets } from './safety.mjs';

export const AUTOPILOT_STOP_REASONS = Object.freeze({
  COMPLETED: 'completed',
  STOPPED: 'stopped-by-user',
  REPO_DIRTY: 'repo-dirty',
  NO_SAFE_TASK: 'no-safe-task',
  GUARD_BLOCK: 'guard-block',
  QUESTION: 'human-question',
  ERROR_BUDGET: 'error-budget-exceeded',
  TIME_BUDGET: 'time-budget-exceeded',
  PR_BUDGET: 'pr-budget-reached',
  SECRET_MISSING: 'secret-missing',
  CLAUDE_UNAVAILABLE: 'claude-unavailable',
  EXEC_DISABLED: 'exec-disabled',
  CLAUDE_FAILED: 'claude-failed',
  NO_PR_PRODUCED: 'no-pr-produced',
});

export const AUTOPILOT_PROGRESS = Object.freeze({
  preflight: 5,
  'preflight-ok': 10,
  'task-selected': 15,
  'reset-to-main': 18,
  'create-branch': 22,
  'launching-claude': 35,
  'claude-running': 50,
  'claude-exited': 60,
  'task-guard': 80,
  'guard-block': 80,
  'check-pr': 92,
  'pr-created': 98,
  'no-pr-no-question': 75,
  'plan-only-ready': 100,
  'preflight-failed': 0,
  'resumed': 50,
});

export const AUTOPILOT_BLOCK_LABELS = Object.freeze([
  'risk:destructive',
  'risk:review-required',
  'ai:human-checkpoint',
]);

export const AUTOPILOT_REQUIRED_LABELS = Object.freeze([
  'ai:autonomous',
  'risk:safe',
]);

export function chooseSafeTask({ items = [], excludeIssues = [], staleDays = 7 }) {
  const exclude = new Set(excludeIssues.map(Number));
  const now = Date.now();
  const filtered = items.filter((it) => {
    if (!it || !Number.isInteger(it.number)) return false;
    if (exclude.has(it.number)) return false;
    const labels = (it.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
    if (AUTOPILOT_BLOCK_LABELS.some((b) => labels.includes(b))) return false;
    if (!AUTOPILOT_REQUIRED_LABELS.every((r) => labels.includes(r))) return false;
    if (it.stale === true) return false;
    if (typeof it.updatedAt === 'string') {
      const ageMs = now - new Date(it.updatedAt).getTime();
      if (ageMs > staleDays * 24 * 3600 * 1000) return false;
    }
    return true;
  });
  filtered.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return filtered[0] ?? null;
}

const AUTOPILOT_IGNORED_DIRTY_PREFIXES = Object.freeze(['.claude/', '.local-control/']);

export function filterDirtyStatusLines(lines) {
  const arr = Array.isArray(lines) ? lines : String(lines ?? '').split('\n');
  const blocking = [];
  for (const raw of arr) {
    if (raw == null) continue;
    const line = String(raw).replace(/\r$/, '');
    if (line.trim() === '') continue;
    const path = line.length >= 3 ? line.slice(3) : line;
    const cleanPath = path.replace(/^"(.*)"$/, '$1');
    const ignored = AUTOPILOT_IGNORED_DIRTY_PREFIXES.some(
      (p) => cleanPath === p || cleanPath === p.replace(/\/$/, '') || cleanPath.startsWith(p),
    );
    if (ignored) continue;
    blocking.push(line);
  }
  return blocking;
}

export function evaluatePreflight({ gitInfo, claudeAvailable, settings, env, mode }) {
  const reasons = [];
  if (gitInfo?.dirty) {
    const files = Array.isArray(gitInfo.dirtyFiles) ? gitInfo.dirtyFiles : [];
    reasons.push(files.length ? `repo dirty: ${files.join(', ')}` : 'repo dirty');
  }
  if (gitInfo?.branch && gitInfo.branch !== 'main') reasons.push(`not on main (currently ${gitInfo.branch})`);
  if (!claudeAvailable && (mode === 'exec' || mode === 'loop')) reasons.push('Claude CLI not available');
  if (mode !== 'plan' && !settings?.allowExec) reasons.push('allowExec disabled');
  if (mode === 'loop' && !settings?.allowLoop) reasons.push('allowLoop disabled');
  for (const k of ['CLAUDE_CODE_COMMAND', 'GITHUB_OWNER', 'GITHUB_REPO']) {
    if (!env?.[k]) reasons.push(`missing env: ${k}`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function shouldStopRun({ run, settings, now = Date.now() }) {
  if (!run) return { stop: true, reason: AUTOPILOT_STOP_REASONS.STOPPED };
  if (run.stopRequested) return { stop: true, reason: AUTOPILOT_STOP_REASONS.STOPPED };
  if (run.errors >= 3) return { stop: true, reason: AUTOPILOT_STOP_REASONS.ERROR_BUDGET };
  const minutes = (now - new Date(run.startedAt).getTime()) / 60000;
  if (minutes > (settings?.maxMinutes ?? 60)) return { stop: true, reason: AUTOPILOT_STOP_REASONS.TIME_BUDGET };
  if ((run.prsCreated ?? 0) >= (settings?.maxPrsPerRun ?? 3)) return { stop: true, reason: AUTOPILOT_STOP_REASONS.PR_BUDGET };
  if (run.pendingQuestionId) return { stop: true, reason: AUTOPILOT_STOP_REASONS.QUESTION };
  return { stop: false, reason: null };
}

export function buildAutopilotState({ id, mode, issue, branch, settingsSnapshot, issueTitle, unattended = false, plannedTasks = null }) {
  const now = new Date().toISOString();
  return {
    id: id ?? randomUUID(),
    kind: 'autopilot',
    mode,
    issue: issue ?? null,
    issueTitle: issueTitle ?? null,
    branch: branch ?? null,
    status: 'running',
    currentStep: 'preflight',
    startedAt: now,
    updatedAt: now,
    stoppedAt: null,
    completedAt: null,
    stopReason: null,
    pendingQuestionId: null,
    prsCreated: 0,
    prUrl: null,
    prNumber: null,
    issuesProcessed: [],
    errors: 0,
    lastError: null,
    nextAction: 'select-task',
    lastPR: null,
    lastPrompt: null,
    resumeAvailable: false,
    settingsSnapshot: settingsSnapshot ?? null,
    log: [],
    stopRequested: false,
    unattended: !!unattended,
    plannedTasks: plannedTasks ?? null,
    failedIssues: [],
    skippedIssues: [],
    completedIssues: [],
    createdPrs: [],
    attempts: {},
    missionReport: null,
  };
}

export function runStep(run, step, info = {}) {
  run.currentStep = step;
  run.updatedAt = new Date().toISOString();
  run.log.push({ at: run.updatedAt, step, ...info });
  if (run.log.length > 200) run.log.splice(0, run.log.length - 200);
  return run;
}

export function recordError(run, err) {
  run.errors = (run.errors ?? 0) + 1;
  const msg = redactSecrets(err?.message ?? String(err), []);
  run.lastError = msg;
  run.log.push({ at: new Date().toISOString(), step: run.currentStep, error: msg });
  return run;
}

export function recordPR({ run, pr }) {
  run.prsCreated = (run.prsCreated ?? 0) + 1;
  run.lastPR = pr;
  if (pr?.url) run.prUrl = pr.url;
  if (pr?.number) run.prNumber = pr.number;
  if (!Array.isArray(run.createdPrs)) run.createdPrs = [];
  const entry = {
    number: pr?.number ?? null,
    url: pr?.url ?? null,
    title: pr?.title ?? null,
    branch: pr?.branch ?? run.branch ?? null,
    issueNumber: pr?.issueNumber ?? run.issue ?? null,
    checks: pr?.checks ?? null,
    createdAt: new Date().toISOString(),
  };
  run.createdPrs.push(entry);
  return run;
}

export function recordIssueCompleted(run, issueNum, extras = {}) {
  if (!Array.isArray(run.completedIssues)) run.completedIssues = [];
  run.completedIssues.push({
    number: issueNum,
    title: extras.title ?? null,
    prUrl: extras.prUrl ?? null,
    prNumber: extras.prNumber ?? null,
    at: new Date().toISOString(),
  });
  return run;
}

export function recordIssueFailed(run, issueNum, reason, extras = {}) {
  if (!Array.isArray(run.failedIssues)) run.failedIssues = [];
  run.failedIssues.push({
    number: issueNum,
    title: extras.title ?? null,
    reason: reason ?? 'unknown',
    detail: extras.detail ?? null,
    step: extras.step ?? run.currentStep ?? null,
    at: new Date().toISOString(),
  });
  return run;
}

export function recordIssueSkipped(run, issueNum, reason, extras = {}) {
  if (!Array.isArray(run.skippedIssues)) run.skippedIssues = [];
  run.skippedIssues.push({
    number: issueNum,
    title: extras.title ?? null,
    reason: reason ?? 'unknown',
    at: new Date().toISOString(),
  });
  return run;
}

export function buildMissionReport(run) {
  if (!run) return null;
  const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : Date.now();
  const endedAt = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  const durationMs = Math.max(0, endedAt - startedAt);
  const created = Array.isArray(run.createdPrs) ? run.createdPrs : [];
  const failed = Array.isArray(run.failedIssues) ? run.failedIssues : [];
  const skipped = Array.isArray(run.skippedIssues) ? run.skippedIssues : [];
  const completed = Array.isArray(run.completedIssues) ? run.completedIssues : [];
  const attempted = (run.issuesProcessed ?? []).length || (completed.length + failed.length + skipped.length);
  let outcome;
  if (run.status === 'completed') {
    if (created.length > 0 && failed.length > 0) outcome = 'partial';
    else if (created.length > 0) outcome = 'completed';
    else if (failed.length > 0) outcome = 'failed';
    else outcome = 'completed';
    if (run.stopReason === AUTOPILOT_STOP_REASONS.NO_SAFE_TASK && created.length === 0 && attempted === 0) outcome = 'completed';
  } else if (run.status === 'failed') {
    outcome = created.length > 0 ? 'partial' : 'failed';
  } else if (run.status === 'stopped') {
    outcome = created.length > 0 ? 'partial' : 'stopped';
  } else if (run.status === 'waiting') {
    outcome = 'waiting';
  } else {
    outcome = run.status ?? 'unknown';
  }
  let nextAction;
  const allowAutoMerge = !!run.settingsSnapshot?.allowAutoMerge;
  if (created.length > 0 && !allowAutoMerge) {
    nextAction = `Review and merge ${created.length} PR${created.length > 1 ? 's' : ''} manually.`;
  } else if (created.length === 0 && failed.length > 0) {
    nextAction = `Inspect ${failed.length} failed issue${failed.length > 1 ? 's' : ''} and retry manually.`;
  } else if (run.status === 'waiting') {
    nextAction = 'Answer pending question, then resume autopilot.';
  } else if (run.stopReason === AUTOPILOT_STOP_REASONS.NO_SAFE_TASK) {
    nextAction = 'No safe task available. Triage queue or label new issues.';
  } else if (created.length === 0 && attempted === 0) {
    nextAction = 'No task ran. Check preflight blockers.';
  } else {
    nextAction = 'Mission ended. Review run log if needed.';
  }
  let summary;
  if (created.length > 0 && failed.length > 0) {
    summary = `Mission terminée : ${created.length} PR créée${created.length > 1 ? 's' : ''}, ${failed.length} issue${failed.length > 1 ? 's' : ''} échouée${failed.length > 1 ? 's' : ''}.`;
  } else if (created.length > 0) {
    summary = `Mission terminée : ${created.length} PR créée${created.length > 1 ? 's' : ''}.`;
  } else if (failed.length > 0 && created.length === 0) {
    const f = failed[0];
    summary = `Aucune PR créée : #${f.number} a échoué (${f.reason}).`;
  } else if (run.stopReason === AUTOPILOT_STOP_REASONS.NO_SAFE_TASK) {
    summary = 'Plus aucune task safe disponible.';
  } else if (run.status === 'waiting') {
    summary = 'Mission en attente d\'une réponse humaine.';
  } else if (run.status === 'stopped') {
    summary = 'Mission stoppée avant la fin.';
  } else {
    summary = 'Mission terminée.';
  }
  return {
    runId: run.id,
    outcome,
    summary,
    durationMs,
    startedAt: run.startedAt,
    endedAt: run.completedAt,
    plannedTasks: run.plannedTasks ?? null,
    unattended: !!run.unattended,
    attempted,
    completedCount: completed.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    prsCreated: created.length,
    completedIssues: completed,
    failedIssues: failed,
    skippedIssues: skipped,
    createdPrs: created,
    pendingQuestionId: run.pendingQuestionId ?? null,
    stopReason: run.stopReason ?? null,
    nextAction,
    autoMergeAllowed: allowAutoMerge,
  };
}

const FAILURE_REASONS = new Set([
  AUTOPILOT_STOP_REASONS.REPO_DIRTY,
  AUTOPILOT_STOP_REASONS.GUARD_BLOCK,
  AUTOPILOT_STOP_REASONS.ERROR_BUDGET,
  AUTOPILOT_STOP_REASONS.SECRET_MISSING,
  AUTOPILOT_STOP_REASONS.CLAUDE_UNAVAILABLE,
  AUTOPILOT_STOP_REASONS.CLAUDE_FAILED,
  AUTOPILOT_STOP_REASONS.NO_PR_PRODUCED,
]);

export function markStopped(run, reason) {
  if (reason === AUTOPILOT_STOP_REASONS.COMPLETED) {
    run.status = 'completed';
    run.nextAction = run.prUrl ? 'review-pr' : 'idle';
  } else if (FAILURE_REASONS.has(reason)) {
    run.status = 'failed';
    run.nextAction = 'retry-or-inspect';
  } else {
    run.status = 'stopped';
    run.nextAction = 'idle';
  }
  run.stopReason = reason;
  run.stoppedAt = new Date().toISOString();
  run.completedAt = run.stoppedAt;
  run.missionReport = buildMissionReport(run);
  return run;
}

export function markWaitingOnQuestion(run, qid) {
  run.status = 'waiting';
  run.pendingQuestionId = qid;
  run.resumeAvailable = true;
  run.nextAction = `answer question ${qid}`;
  return run;
}

export function exportRunSummary(run) {
  if (!run) return null;
  const progress = AUTOPILOT_PROGRESS[run.currentStep] ?? 0;
  const finalProgress =
    run.status === 'completed' ? 100 :
    run.status === 'failed' || run.status === 'stopped' ? Math.max(progress, 0) :
    progress;
  return {
    id: run.id,
    kind: run.kind,
    mode: run.mode,
    status: run.status,
    issue: run.issue,
    issueTitle: run.issueTitle,
    branch: run.branch,
    currentStep: run.currentStep,
    progressPercent: finalProgress,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    stoppedAt: run.stoppedAt,
    completedAt: run.completedAt,
    stopReason: run.stopReason,
    pendingQuestionId: run.pendingQuestionId,
    prsCreated: run.prsCreated,
    prUrl: run.prUrl ?? run.lastPR?.url ?? null,
    prNumber: run.prNumber ?? run.lastPR?.number ?? null,
    issuesProcessed: run.issuesProcessed,
    errors: run.errors,
    lastError: run.lastError ?? null,
    nextAction: run.nextAction,
    lastPR: run.lastPR,
    lastPrompt: run.lastPrompt ?? null,
    resumeAvailable: run.resumeAvailable,
    logsCount: (run.log ?? []).length,
    log: (run.log ?? []).slice(-30),
    unattended: !!run.unattended,
    plannedTasks: run.plannedTasks ?? null,
    failedIssues: Array.isArray(run.failedIssues) ? run.failedIssues : [],
    skippedIssues: Array.isArray(run.skippedIssues) ? run.skippedIssues : [],
    completedIssues: Array.isArray(run.completedIssues) ? run.completedIssues : [],
    createdPrs: Array.isArray(run.createdPrs) ? run.createdPrs : [],
    missionReport: run.missionReport ?? (run.status === 'completed' || run.status === 'failed' || run.status === 'stopped' ? buildMissionReport(run) : null),
  };
}

function gitDirtyFiles(repoRoot) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, files: [] };
  const lines = r.stdout.split('\n');
  const blocking = filterDirtyStatusLines(lines);
  return { ok: true, files: blocking.map((l) => (l.length >= 3 ? l.slice(3) : l).replace(/^"(.*)"$/, '$1')) };
}
function gitBranch(repoRoot) {
  const r = spawnSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function loadQueueItems(repoRoot) {
  const r = spawnSync('node', ['tools/task-score.mjs', '--queue'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, items: [], reason: r.stderr || 'queue failed' };
  try {
    const parsed = JSON.parse(r.stdout);
    return { ok: true, items: Array.isArray(parsed) ? parsed : (parsed.items ?? []) };
  } catch { return { ok: false, items: [], reason: 'queue parse error' }; }
}

export function preflightFromRepo({ repoRoot, claudeAvailable, settings, env, mode }) {
  const dirtyInfo = gitDirtyFiles(repoRoot);
  const gitInfo = { branch: gitBranch(repoRoot), dirty: dirtyInfo.files.length > 0, dirtyFiles: dirtyInfo.files };
  const evaluated = evaluatePreflight({ gitInfo, claudeAvailable, settings, env, mode });
  return { ...evaluated, gitInfo };
}

export function resetToMain(repoRoot) {
  const sw = spawnSync('git', ['switch', 'main'], { cwd: repoRoot, encoding: 'utf8' });
  if (sw.status !== 0) return { ok: false, reason: sw.stderr || 'switch failed' };
  const pull = spawnSync('git', ['pull', '--ff-only'], { cwd: repoRoot, encoding: 'utf8' });
  if (pull.status !== 0) return { ok: false, reason: pull.stderr || 'pull failed' };
  return { ok: true };
}

export function createBranch(repoRoot, branch) {
  if (!/^[a-zA-Z0-9._/-]{3,80}$/.test(branch)) return { ok: false, reason: 'invalid branch name' };
  const exist = spawnSync('git', ['rev-parse', '--verify', branch], { cwd: repoRoot, encoding: 'utf8' });
  if (exist.status === 0) {
    const sw = spawnSync('git', ['switch', branch], { cwd: repoRoot, encoding: 'utf8' });
    if (sw.status !== 0) return { ok: false, reason: sw.stderr };
    return { ok: true, reused: true };
  }
  const r = spawnSync('git', ['switch', '-c', branch], { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 ? { ok: true, reused: false } : { ok: false, reason: r.stderr };
}

export function runTaskGuard(repoRoot) {
  const r = spawnSync('node', ['tools/task-guard.mjs', '--json'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) return { ok: false, allow: false, reason: 'guard error' };
  try {
    const j = JSON.parse(r.stdout);
    return { ok: true, allow: j.allow === true, violations: j.violations ?? [] };
  } catch { return { ok: false, allow: false, reason: 'guard parse error' }; }
}

export function findOpenPRForBranch(repoRoot, branch) {
  const r = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url,title'], {
    cwd: repoRoot, encoding: 'utf8',
  });
  if (r.status !== 0) return null;
  try {
    const arr = JSON.parse(r.stdout);
    return Array.isArray(arr) && arr.length ? { number: arr[0].number, url: arr[0].url, title: arr[0].title } : null;
  } catch { return null; }
}

export function findClaudeQuestionOnIssue(repoRoot, issueNum) {
  const r = spawnSync('gh', ['api', `repos/{owner}/{repo}/issues/${issueNum}/comments`], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  try {
    const arr = JSON.parse(r.stdout);
    if (!Array.isArray(arr)) return null;
    for (const c of arr.slice().reverse()) {
      if (typeof c.body === 'string' && c.body.startsWith('<!-- claude-question v1')) {
        const qid = (c.body.match(/qid:\s*([\w-]+)/) ?? [])[1] ?? `q-${c.id}`;
        return { id: qid, url: c.html_url };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export class AutopilotEngine {
  constructor({ repoRoot, settings, store, logs, env, claudeAdapter, dryRun = true, notifier = null }) {
    this.repoRoot = repoRoot;
    this.settings = settings;
    this.store = store;
    this.logs = logs;
    this.env = env;
    this.claudeAdapter = claudeAdapter;
    this.dryRun = dryRun;
    this.notifier = notifier;
    this.activeRun = null;
    this.activeChild = null;
    this.activeRunId = null;
    this.subscribers = new Set();
  }
  hasActive() { return !!this.activeRun && (this.activeRun.status === 'running' || this.activeRun.status === 'waiting'); }
  subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
  _emit(event, payload) {
    for (const fn of Array.from(this.subscribers)) {
      try { fn(event, payload); } catch { /* ignore */ }
    }
  }

  async start({ mode = 'plan', issue = null, unattended = null, plannedTasks = null }) {
    if (this.hasActive()) return { ok: false, reason: 'autopilot already active', run: exportRunSummary(this.activeRun) };

    const settingsSnapshot = this.settings.get();
    const claudeAvailable = !!this.claudeAdapter?.available;
    const wantExec = mode !== 'plan' && settingsSnapshot.allowExec && claudeAvailable && !this.dryRun;
    const wantLoop = mode === 'loop' && settingsSnapshot.allowLoop && wantExec;
    const isUnattended = unattended != null ? !!unattended : !!wantLoop;
    const planned = plannedTasks ?? (wantLoop ? (settingsSnapshot.maxPrsPerRun ?? 5) : 1);

    const pre = preflightFromRepo({ repoRoot: this.repoRoot, claudeAvailable, settings: settingsSnapshot, env: this.env, mode });
    const run = buildAutopilotState({ mode, issue, settingsSnapshot, unattended: isUnattended, plannedTasks: planned });
    this.activeRun = run;
    this.activeRunId = run.id;
    this._persist(); this._emit('state', exportRunSummary(run));

    if (!pre.ok) {
      runStep(run, 'preflight-failed', { reasons: pre.reasons, dirtyFiles: pre.gitInfo?.dirtyFiles ?? [] });
      const stopReason = pre.gitInfo?.dirty
        ? AUTOPILOT_STOP_REASONS.REPO_DIRTY
        : AUTOPILOT_STOP_REASONS.GUARD_BLOCK;
      markStopped(run, stopReason);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { ok: false, reason: pre.reasons.join('; '), run: exportRunSummary(run), dirtyFiles: pre.gitInfo?.dirtyFiles ?? [] };
    }
    runStep(run, 'preflight-ok');

    if (!wantExec) {
      const chosenIssue = await this._pickIssue({ run, issue });
      if (!chosenIssue) return { ok: false, reason: run.stopReason, run: exportRunSummary(run) };
      const branch = `feat/issue-${chosenIssue}-autopilot`;
      run.branch = branch;
      const prep = this.claudeAdapter?.prepare?.({ issue: chosenIssue, mode: 'plan', env: this.env, repoRoot: this.repoRoot }) ?? null;
      run.lastPrompt = prep?.prompt ?? null;
      run.nextAction = 'copy prompt and run yu locally';
      runStep(run, 'plan-only-ready', { reason: !claudeAvailable ? 'claude unavailable' : !settingsSnapshot.allowExec ? 'allowExec=false' : 'dry-run' });
      markStopped(run, AUTOPILOT_STOP_REASONS.COMPLETED);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { ok: true, run: exportRunSummary(run), prompt: prep?.prompt ?? null, branch };
    }

    // Real exec mode — run lifecycle in background.
    this._runLifecycle({ run, settingsSnapshot, wantLoop, initialIssue: issue }).catch((err) => {
      recordError(run, err);
      markStopped(run, AUTOPILOT_STOP_REASONS.ERROR_BUDGET);
      this._persist(); this._emit('state', exportRunSummary(run));
    });
    return { ok: true, run: exportRunSummary(run), launched: true, mode: wantLoop ? 'loop' : 'run-one' };
  }

  async _pickIssue({ run, issue }) {
    if (issue) { run.issue = issue; runStep(run, 'task-selected', { issue, branch: `feat/issue-${issue}-autopilot` }); return { number: issue, title: null }; }
    const queue = loadQueueItems(this.repoRoot);
    if (!queue.ok) {
      recordError(run, new Error(queue.reason));
      markStopped(run, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
      this._persist();
      return null;
    }
    const failedNums = (run.failedIssues ?? []).map((f) => Number(f.number));
    const skippedNums = (run.skippedIssues ?? []).map((s) => Number(s.number));
    const exclude = Array.from(new Set([...(run.issuesProcessed ?? []), ...failedNums, ...skippedNums]));
    const safe = chooseSafeTask({ items: queue.items, excludeIssues: exclude, staleDays: run.settingsSnapshot?.staleDays });
    if (!safe) {
      markStopped(run, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
      this._persist();
      return null;
    }
    run.issue = safe.number;
    run.issueTitle = safe.title ?? null;
    runStep(run, 'task-selected', { issue: safe.number, title: safe.title ?? null, branch: `feat/issue-${safe.number}-autopilot` });
    return { number: safe.number, title: safe.title ?? null };
  }

  async _runLifecycle({ run, settingsSnapshot, wantLoop, initialIssue }) {
    const maxErrors = settingsSnapshot.maxErrors ?? 3;
    const maxPRs = settingsSnapshot.maxPrsPerRun ?? (wantLoop ? 5 : 1);
    const maxRetriesPerIssue = settingsSnapshot.maxRetriesPerIssue ?? 1;
    const startedAt = Date.now();
    const maxMs = (settingsSnapshot.maxMinutes ?? 60) * 60 * 1000;

    if (this.notifier) {
      try { await this.notifier.notify('mission_started', { runId: run.id, mode: run.mode, plannedTasks: run.plannedTasks, unattended: !!run.unattended }); } catch {}
    }

    let iterIssue = initialIssue ?? null;
    while (true) {
      if (run.stopRequested) { markStopped(run, AUTOPILOT_STOP_REASONS.STOPPED); break; }
      if (Date.now() - startedAt > maxMs) { markStopped(run, AUTOPILOT_STOP_REASONS.TIME_BUDGET); break; }
      if (run.errors >= maxErrors) { markStopped(run, AUTOPILOT_STOP_REASONS.ERROR_BUDGET); break; }
      if ((run.prsCreated ?? 0) >= maxPRs) { markStopped(run, AUTOPILOT_STOP_REASONS.PR_BUDGET); break; }

      const picked = await this._pickIssue({ run, issue: iterIssue });
      if (!picked) break;
      iterIssue = null;
      const issueNum = picked.number;
      const issueTitle = picked.title ?? run.issueTitle ?? null;

      run.attempts = run.attempts ?? {};
      run.attempts[issueNum] = (run.attempts[issueNum] ?? 0) + 1;

      const outcome = await this._attemptIssue(run, issueNum, issueTitle);

      if (outcome.fatal) {
        // already markStopped by handler
        break;
      }

      if (outcome.kind === 'pr') {
        recordIssueCompleted(run, issueNum, { title: issueTitle, prUrl: outcome.pr?.url ?? null, prNumber: outcome.pr?.number ?? null });
        if (!run.issuesProcessed.includes(issueNum)) run.issuesProcessed.push(issueNum);
        if (this.notifier) {
          try { await this.notifier.notify('pr_created', { runId: run.id, issue: issueNum, pr: outcome.pr }); } catch {}
        }
        if (!wantLoop) { markStopped(run, AUTOPILOT_STOP_REASONS.COMPLETED); break; }
      } else if (outcome.kind === 'waiting') {
        // markWaitingOnQuestion already set
        if (this.notifier) {
          try { await this.notifier.notify('question_required', { runId: run.id, issue: issueNum, qid: run.pendingQuestionId }); } catch {}
        }
        break;
      } else if (outcome.kind === 'failed') {
        recordIssueFailed(run, issueNum, outcome.reason ?? 'unknown', { title: issueTitle, detail: outcome.detail ?? null, step: run.currentStep });
        if (!run.issuesProcessed.includes(issueNum)) run.issuesProcessed.push(issueNum);
        if (this.notifier) {
          try { await this.notifier.notify('issue_failed', { runId: run.id, issue: issueNum, reason: outcome.reason, detail: outcome.detail ?? null }); } catch {}
        }
        if (!wantLoop) {
          markStopped(run, outcome.stopReason ?? AUTOPILOT_STOP_REASONS.CLAUDE_FAILED);
          break;
        }
        // wantLoop: continue, picker will exclude this issue
        continue;
      } else if (outcome.kind === 'skipped') {
        recordIssueSkipped(run, issueNum, outcome.reason ?? 'skipped', { title: issueTitle });
        continue;
      }
    }
    if (run.status === 'running') markStopped(run, AUTOPILOT_STOP_REASONS.COMPLETED);
    if (this.notifier) {
      try { await this.notifier.notify('mission_completed', { runId: run.id, report: run.missionReport }); } catch {}
    }
    this._persist(); this._emit('state', exportRunSummary(run));
  }

  async _attemptIssue(run, issueNum, issueTitle) {
    const branch = `feat/issue-${issueNum}-autopilot`;
    run.branch = branch;
    if (issueTitle && !run.issueTitle) run.issueTitle = issueTitle;
    this._persist(); this._emit('state', exportRunSummary(run));

    runStep(run, 'reset-to-main');
    const reset = resetToMain(this.repoRoot);
    if (!reset.ok) {
      recordError(run, new Error('reset to main failed: ' + (reset.reason ?? '?')));
      markStopped(run, AUTOPILOT_STOP_REASONS.REPO_DIRTY);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { kind: 'failed', fatal: true, reason: AUTOPILOT_STOP_REASONS.REPO_DIRTY, detail: reset.reason ?? null };
    }

    runStep(run, 'create-branch', { branch });
    const br = createBranch(this.repoRoot, branch);
    if (!br.ok) {
      recordError(run, new Error('create-branch failed: ' + (br.reason ?? '?')));
      markStopped(run, AUTOPILOT_STOP_REASONS.REPO_DIRTY);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { kind: 'failed', fatal: true, reason: AUTOPILOT_STOP_REASONS.REPO_DIRTY, detail: br.reason ?? null };
    }

    const prep = this.claudeAdapter.prepare({ issue: issueNum, mode: 'exec', env: this.env, repoRoot: this.repoRoot });
    run.lastPrompt = prep.prompt;
    runStep(run, 'launching-claude');
    this._persist(); this._emit('state', exportRunSummary(run));

    const launch = this.claudeAdapter.launch({ prompt: prep.prompt, command: prep.command, repoRoot: this.repoRoot, env: this.env });
    if (!launch.ok) {
      recordError(run, new Error('launch failed: ' + (launch.reason ?? '?')));
      markStopped(run, AUTOPILOT_STOP_REASONS.CLAUDE_UNAVAILABLE);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { kind: 'failed', fatal: true, reason: AUTOPILOT_STOP_REASONS.CLAUDE_UNAVAILABLE, detail: launch.reason ?? null };
    }
    this.activeChild = launch.child;

    let lastStderr = '';
    let lastStdout = '';
    const exitCode = await new Promise((resolveP) => {
      const onClose = (code) => { try { launch.child.removeAllListeners(); } catch {} resolveP(code ?? 0); };
      launch.child.on('close', onClose);
      launch.child.on('error', () => onClose(1));
      const tok = run.settingsSnapshot?.authToken;
      const stream = (label) => (chunk) => {
        const text = redactSecrets(chunk.toString('utf8'), tok ? [tok] : []);
        if (label === 'stderr') lastStderr = (lastStderr + text).slice(-2000);
        else lastStdout = (lastStdout + text).slice(-2000);
        if (this.logs?.append) this.logs.append(run.id, label, text);
        this._emit('log', { runId: run.id, stream: label, chunk: text });
      };
      launch.child.stdout?.on('data', stream('stdout'));
      launch.child.stderr?.on('data', stream('stderr'));
    });
    this.activeChild = null;

    if (run.stopRequested) {
      markStopped(run, AUTOPILOT_STOP_REASONS.STOPPED);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { kind: 'failed', fatal: true, reason: AUTOPILOT_STOP_REASONS.STOPPED };
    }

    runStep(run, 'claude-exited', { exitCode });

    if (exitCode !== 0) {
      recordError(run, new Error(`claude exit=${exitCode}`));
      this._persist(); this._emit('state', exportRunSummary(run));
      return {
        kind: 'failed', fatal: false,
        reason: AUTOPILOT_STOP_REASONS.CLAUDE_FAILED,
        stopReason: AUTOPILOT_STOP_REASONS.CLAUDE_FAILED,
        detail: (lastStderr || lastStdout || `exit=${exitCode}`).trim().slice(-400) || null,
      };
    }

    runStep(run, 'task-guard');
    const guard = runTaskGuard(this.repoRoot);
    if (!guard.ok && !guard.allow) {
      runStep(run, 'guard-block', { violations: guard.violations });
      this._persist(); this._emit('state', exportRunSummary(run));
      return {
        kind: 'failed', fatal: false,
        reason: AUTOPILOT_STOP_REASONS.GUARD_BLOCK,
        stopReason: AUTOPILOT_STOP_REASONS.GUARD_BLOCK,
        detail: Array.isArray(guard.violations) ? guard.violations.slice(0, 5).join('; ') : null,
      };
    }

    runStep(run, 'check-pr');
    const pr = findOpenPRForBranch(this.repoRoot, branch);
    if (pr) {
      recordPR({ run, pr: { ...pr, branch, issueNumber: issueNum } });
      runStep(run, 'pr-created', pr);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { kind: 'pr', fatal: false, pr: { ...pr, branch, issueNumber: issueNum } };
    }
    const q = findClaudeQuestionOnIssue(this.repoRoot, issueNum);
    if (q) {
      markWaitingOnQuestion(run, q.id);
      this._persist(); this._emit('state', exportRunSummary(run));
      return { kind: 'waiting', fatal: false, qid: q.id };
    }
    runStep(run, 'no-pr-no-question');
    recordError(run, new Error('claude did not open PR and posted no question'));
    this._persist(); this._emit('state', exportRunSummary(run));
    return {
      kind: 'failed', fatal: false,
      reason: AUTOPILOT_STOP_REASONS.NO_PR_PRODUCED,
      stopReason: AUTOPILOT_STOP_REASONS.NO_PR_PRODUCED,
      detail: 'Claude exited 0 but produced no PR and no question.',
    };
  }

  stop() {
    if (!this.activeRun) return { ok: false, reason: 'no active run' };
    this.activeRun.stopRequested = true;
    if (this.activeChild) {
      try { this.activeChild.kill('SIGTERM'); } catch { /* ignore */ }
    }
    markStopped(this.activeRun, AUTOPILOT_STOP_REASONS.STOPPED);
    this._persist();
    return { ok: true, run: exportRunSummary(this.activeRun) };
  }

  resume({ answeredQid } = {}) {
    const run = this.activeRun;
    if (!run) return { ok: false, reason: 'no run to resume' };
    if (run.status !== 'waiting') return { ok: false, reason: `cannot resume from status ${run.status}` };
    if (run.pendingQuestionId && answeredQid !== run.pendingQuestionId) {
      return { ok: false, reason: 'pending question not answered' };
    }
    run.pendingQuestionId = null;
    run.status = 'running';
    run.nextAction = 'continue';
    runStep(run, 'resumed');
    this._persist();
    return { ok: true, run: exportRunSummary(run) };
  }

  current() { return this.activeRun ? exportRunSummary(this.activeRun) : null; }

  history({ limit = 20 } = {}) {
    if (!this.store) return [];
    try {
      const items = this.store.list({ limit });
      return items.map((it) => exportRunSummary(it)).filter(Boolean);
    } catch { return []; }
  }

  getRun(runId) {
    if (this.activeRun?.id === runId) return exportRunSummary(this.activeRun);
    if (!this.store) return null;
    try {
      const r = this.store.load(runId);
      return r ? exportRunSummary(r) : null;
    } catch { return null; }
  }

  reset() {
    if (this.activeRun && (this.activeRun.status === 'running' || this.activeRun.status === 'waiting')) {
      return { ok: false, reason: 'cannot reset while a run is active' };
    }
    this.activeRun = null;
    this.activeRunId = null;
    return { ok: true };
  }

  _persist() {
    if (!this.activeRun || !this.store) return;
    try { this.store.save(this.activeRun); } catch { /* best-effort */ }
  }
}
