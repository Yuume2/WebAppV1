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

export function buildAutopilotState({ id, mode, issue, branch, settingsSnapshot, issueTitle }) {
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
  return run;
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
    this.subscribers = new Set();
  }
  hasActive() { return !!this.activeRun && (this.activeRun.status === 'running' || this.activeRun.status === 'waiting'); }
  subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
  _emit(event, payload) {
    for (const fn of Array.from(this.subscribers)) {
      try { fn(event, payload); } catch { /* ignore */ }
    }
  }

  async start({ mode = 'plan', issue = null }) {
    if (this.hasActive()) return { ok: false, reason: 'autopilot already active', run: exportRunSummary(this.activeRun) };

    const settingsSnapshot = this.settings.get();
    const claudeAvailable = !!this.claudeAdapter?.available;
    const wantExec = mode !== 'plan' && settingsSnapshot.allowExec && claudeAvailable && !this.dryRun;
    const wantLoop = mode === 'loop' && settingsSnapshot.allowLoop && wantExec;

    const pre = preflightFromRepo({ repoRoot: this.repoRoot, claudeAvailable, settings: settingsSnapshot, env: this.env, mode });
    const run = buildAutopilotState({ mode, issue, settingsSnapshot });
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
    if (issue) { run.issue = issue; runStep(run, 'task-selected', { issue, branch: `feat/issue-${issue}-autopilot` }); return issue; }
    const queue = loadQueueItems(this.repoRoot);
    if (!queue.ok) {
      recordError(run, new Error(queue.reason));
      markStopped(run, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
      this._persist();
      return null;
    }
    const safe = chooseSafeTask({ items: queue.items, excludeIssues: run.issuesProcessed ?? [], staleDays: run.settingsSnapshot?.staleDays });
    if (!safe) {
      markStopped(run, AUTOPILOT_STOP_REASONS.NO_SAFE_TASK);
      this._persist();
      return null;
    }
    run.issue = safe.number;
    run.issueTitle = safe.title ?? null;
    runStep(run, 'task-selected', { issue: safe.number, title: safe.title ?? null, branch: `feat/issue-${safe.number}-autopilot` });
    return safe.number;
  }

  async _runLifecycle({ run, settingsSnapshot, wantLoop, initialIssue }) {
    const maxErrors = settingsSnapshot.maxErrors ?? 3;
    const maxPRs = settingsSnapshot.maxPrsPerRun ?? 2;
    const startedAt = Date.now();
    const maxMs = (settingsSnapshot.maxMinutes ?? 60) * 60 * 1000;

    let iterIssue = initialIssue ?? null;
    while (true) {
      if (run.stopRequested) { markStopped(run, AUTOPILOT_STOP_REASONS.STOPPED); break; }
      if (Date.now() - startedAt > maxMs) { markStopped(run, AUTOPILOT_STOP_REASONS.TIME_BUDGET); break; }
      if (run.errors >= maxErrors) { markStopped(run, AUTOPILOT_STOP_REASONS.ERROR_BUDGET); break; }
      if ((run.prsCreated ?? 0) >= maxPRs) { markStopped(run, AUTOPILOT_STOP_REASONS.PR_BUDGET); break; }

      const issueNum = await this._pickIssue({ run, issue: iterIssue });
      if (!issueNum) break;
      iterIssue = null; // only first iteration uses initialIssue

      const ok = await this._runSingleIssue(run, issueNum);
      if (!ok) break; // issue handler set stopReason already if fatal
      run.issuesProcessed.push(issueNum);

      if (!wantLoop) { markStopped(run, AUTOPILOT_STOP_REASONS.COMPLETED); break; }
    }
    this._persist(); this._emit('state', exportRunSummary(run));
  }

  async _runSingleIssue(run, issueNum) {
    const branch = `feat/issue-${issueNum}-autopilot`;
    run.branch = branch;
    this._persist(); this._emit('state', exportRunSummary(run));

    runStep(run, 'reset-to-main');
    const reset = resetToMain(this.repoRoot);
    if (!reset.ok) {
      recordError(run, new Error('reset to main failed: ' + (reset.reason ?? '?')));
      markStopped(run, AUTOPILOT_STOP_REASONS.REPO_DIRTY);
      this._persist(); this._emit('state', exportRunSummary(run));
      return false;
    }

    runStep(run, 'create-branch', { branch });
    const br = createBranch(this.repoRoot, branch);
    if (!br.ok) {
      recordError(run, new Error('create-branch failed: ' + (br.reason ?? '?')));
      markStopped(run, AUTOPILOT_STOP_REASONS.REPO_DIRTY);
      this._persist(); this._emit('state', exportRunSummary(run));
      return false;
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
      return false;
    }
    this.activeChild = launch.child;

    const exitCode = await new Promise((resolveP) => {
      const onClose = (code) => { try { launch.child.removeAllListeners(); } catch {} resolveP(code ?? 0); };
      launch.child.on('close', onClose);
      launch.child.on('error', () => onClose(1));
      const tok = run.settingsSnapshot?.authToken;
      const stream = (label) => (chunk) => {
        const text = redactSecrets(chunk.toString('utf8'), tok ? [tok] : []);
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
      return false;
    }

    runStep(run, 'claude-exited', { exitCode });

    if (exitCode !== 0) {
      recordError(run, new Error(`claude exit=${exitCode}`));
      markStopped(run, AUTOPILOT_STOP_REASONS.CLAUDE_FAILED);
      this._persist(); this._emit('state', exportRunSummary(run));
      return false;
    }

    runStep(run, 'task-guard');
    const guard = runTaskGuard(this.repoRoot);
    if (!guard.ok && !guard.allow) {
      runStep(run, 'guard-block', { violations: guard.violations });
      markStopped(run, AUTOPILOT_STOP_REASONS.GUARD_BLOCK);
      this._persist(); this._emit('state', exportRunSummary(run));
      return false;
    }

    runStep(run, 'check-pr');
    const pr = findOpenPRForBranch(this.repoRoot, branch);
    if (pr) {
      recordPR({ run, pr });
      runStep(run, 'pr-created', pr);
      this._persist(); this._emit('state', exportRunSummary(run));
      return true;
    }
    const q = findClaudeQuestionOnIssue(this.repoRoot, issueNum);
    if (q) {
      markWaitingOnQuestion(run, q.id);
      this._persist(); this._emit('state', exportRunSummary(run));
      return false;
    }
    runStep(run, 'no-pr-no-question');
    recordError(run, new Error('claude did not open PR and posted no question'));
    markStopped(run, AUTOPILOT_STOP_REASONS.NO_PR_PRODUCED);
    this._persist(); this._emit('state', exportRunSummary(run));
    return false;
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
