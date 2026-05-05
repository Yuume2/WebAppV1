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

export function evaluatePreflight({ gitInfo, claudeAvailable, settings, env, mode }) {
  const reasons = [];
  if (gitInfo?.dirty) reasons.push('repo dirty');
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

export function buildAutopilotState({ id, mode, issue, branch, settingsSnapshot }) {
  return {
    id: id ?? randomUUID(),
    kind: 'autopilot',
    mode,
    issue: issue ?? null,
    branch: branch ?? null,
    status: 'running',
    currentStep: 'preflight',
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    stopReason: null,
    pendingQuestionId: null,
    prsCreated: 0,
    issuesProcessed: [],
    errors: 0,
    nextAction: 'select-task',
    lastPR: null,
    resumeAvailable: false,
    settingsSnapshot: settingsSnapshot ?? null,
    log: [],
    stopRequested: false,
  };
}

export function runStep(run, step, info = {}) {
  run.currentStep = step;
  run.log.push({ at: new Date().toISOString(), step, ...info });
  if (run.log.length > 200) run.log.splice(0, run.log.length - 200);
  return run;
}

export function recordError(run, err) {
  run.errors = (run.errors ?? 0) + 1;
  run.log.push({ at: new Date().toISOString(), step: run.currentStep, error: redactSecrets(err?.message ?? String(err), []) });
  return run;
}

export function recordPR({ run, pr }) {
  run.prsCreated = (run.prsCreated ?? 0) + 1;
  run.lastPR = pr;
  return run;
}

export function markStopped(run, reason) {
  run.status = reason === AUTOPILOT_STOP_REASONS.COMPLETED ? 'completed' : 'stopped';
  run.stopReason = reason;
  run.stoppedAt = new Date().toISOString();
  run.nextAction = 'idle';
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
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    issue: run.issue,
    branch: run.branch,
    currentStep: run.currentStep,
    startedAt: run.startedAt,
    stoppedAt: run.stoppedAt,
    stopReason: run.stopReason,
    pendingQuestionId: run.pendingQuestionId,
    prsCreated: run.prsCreated,
    issuesProcessed: run.issuesProcessed,
    errors: run.errors,
    nextAction: run.nextAction,
    lastPR: run.lastPR,
    resumeAvailable: run.resumeAvailable,
    log: run.log.slice(-30),
  };
}

function gitClean(repoRoot) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length === 0;
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
  const gitInfo = { branch: gitBranch(repoRoot), dirty: !gitClean(repoRoot) };
  const evaluated = evaluatePreflight({ gitInfo, claudeAvailable, settings, env, mode });
  return { ...evaluated, gitInfo };
}

export class AutopilotEngine {
  constructor({ repoRoot, settings, store, logs, env, claudeAdapter, dryRun = true }) {
    this.repoRoot = repoRoot;
    this.settings = settings;
    this.store = store;
    this.logs = logs;
    this.env = env;
    this.claudeAdapter = claudeAdapter;
    this.dryRun = dryRun;
    this.activeRun = null;
    this.activeChild = null;
    this.activeRunId = null;
  }
  hasActive() { return !!this.activeRun && this.activeRun.status === 'running'; }

  async start({ mode = 'plan', issue = null }) {
    if (this.activeRun && (this.activeRun.status === 'running' || this.activeRun.status === 'waiting')) {
      return { ok: false, reason: 'autopilot already active', run: exportRunSummary(this.activeRun) };
    }
    const settingsSnapshot = this.settings.get();
    const claudeAvailable = !!this.claudeAdapter?.available;
    const pre = preflightFromRepo({
      repoRoot: this.repoRoot,
      claudeAvailable,
      settings: settingsSnapshot,
      env: this.env,
      mode,
    });
    const run = buildAutopilotState({ mode, issue, settingsSnapshot });
    this.activeRun = run;
    this.activeRunId = run.id;
    if (!pre.ok) {
      runStep(run, 'preflight-failed', { reasons: pre.reasons });
      markStopped(run, AUTOPILOT_STOP_REASONS.REPO_DIRTY);
      this._persist();
      return { ok: false, reason: pre.reasons.join('; '), run: exportRunSummary(run) };
    }
    runStep(run, 'preflight-ok');

    let chosenIssue = issue;
    if (!chosenIssue) {
      const queue = loadQueueItems(this.repoRoot);
      if (!queue.ok) {
        recordError(run, new Error(queue.reason));
        markStopped(run, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
        this._persist();
        return { ok: false, reason: queue.reason, run: exportRunSummary(run) };
      }
      const safe = chooseSafeTask({ items: queue.items, staleDays: settingsSnapshot.staleDays });
      if (!safe) {
        markStopped(run, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
        this._persist();
        return { ok: false, reason: 'no safe task available', run: exportRunSummary(run) };
      }
      chosenIssue = safe.number;
      run.issue = chosenIssue;
    }

    const branch = `feat/issue-${chosenIssue}-autopilot`;
    run.branch = branch;
    runStep(run, 'task-selected', { issue: chosenIssue, branch });

    const prep = this.claudeAdapter?.prepare?.({ issue: chosenIssue, mode, env: this.env, repoRoot: this.repoRoot })
      ?? null;
    run.lastPrompt = prep?.prompt ?? null;
    runStep(run, 'prompt-ready');

    if (mode === 'plan' || this.dryRun || !claudeAvailable || !settingsSnapshot.allowExec) {
      run.nextAction = 'manual: copy prompt and run yu locally';
      runStep(run, 'plan-only-ready', { reason: this.dryRun ? 'dry-run' : (!claudeAvailable ? 'claude unavailable' : 'exec disabled') });
      markStopped(run, AUTOPILOT_STOP_REASONS.COMPLETED);
      this._persist();
      return { ok: true, run: exportRunSummary(run), prompt: prep?.prompt ?? null, branch };
    }

    runStep(run, 'launching-claude');
    const launch = this.claudeAdapter.launch({ prompt: prep.prompt, command: prep.command, repoRoot: this.repoRoot, env: this.env });
    if (!launch.ok) {
      recordError(run, new Error(launch.reason ?? 'launch failed'));
      markStopped(run, AUTOPILOT_STOP_REASONS.CLAUDE_UNAVAILABLE);
      this._persist();
      return { ok: false, reason: launch.reason, run: exportRunSummary(run) };
    }
    this.activeChild = launch.child;
    run.nextAction = 'claude running';
    this._persist();
    return { ok: true, run: exportRunSummary(run), branch, launched: true };
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

  _persist() {
    if (!this.activeRun || !this.store) return;
    try { this.store.save(this.activeRun); } catch { /* best-effort */ }
  }
}
