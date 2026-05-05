import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { SettingsStore } from './settings.mjs';
import { isAuthenticated, extractToken, constantTimeEqual } from './auth.mjs';
import { LogStore, StateStore } from './logs.mjs';
import { Runner } from './runner.mjs';
import { resolveCommand, COMMANDS } from './commands.mjs';
import { redactSecrets } from './safety.mjs';
import {
  fetchPrContext, fetchIssueLabels, fetchBranchProtection,
  runTaskGuard, evaluateAutoMerge, applyAutoMerge,
} from './automerge.mjs';
import { loadV5Env, evaluateV5Env } from './v5-env.mjs';
import { v5StatusFromEnv, prepareClaudeRun, buildAdapter } from './claude-adapter.mjs';
import { V5StateStore } from './state.mjs';
import { evaluateResume } from './resume.mjs';
import { evaluateNotionConfig, validateNotionDatabase } from './integrations/notion-questions.mjs';
import { evaluateN8nConfig } from './integrations/n8n-webhooks.mjs';
import { evaluateWhatsappConfig } from './integrations/whatsapp.mjs';
import { AutopilotEngine, exportRunSummary, loadQueueItems } from './autopilot.mjs';
import { runDoctorJson, summarizeDoctor } from './doctor.mjs';
import { selectBestTask, evaluateRunnability } from './task-select.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT_DEFAULT = resolve(__dirname, '..', '..');
const VERSION = '1.0.0';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

function repoNameWithOwner(repoRoot) {
  const r = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    cwd: repoRoot, encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : null;
}
function lanIPv4() {
  const ifs = networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return null;
}
function gitInfo(repoRoot) {
  const branchR = spawnSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' });
  const dirtyR  = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  return {
    branch: branchR.status === 0 ? branchR.stdout.trim() : null,
    dirty: dirtyR.status === 0 ? dirtyR.stdout.trim().length > 0 : false,
  };
}

export function buildApp({ repoRoot = REPO_ROOT_DEFAULT } = {}) {
  const settings = new SettingsStore(repoRoot);
  settings.load();
  const state = new StateStore();
  const logs = new LogStore(repoRoot);
  const runner = new Runner({ logs, state, settings, repoRoot });
  const startedAt = Date.now();
  const network = { host: '127.0.0.1', port: 8787, lan: false };
  const v5Store = new V5StateStore(repoRoot);
  const autopilotStore = new V5StateStore(repoRoot);
  let autopilot = null;
  function getAutopilot() {
    if (autopilot) return autopilot;
    const { values: env } = loadV5Env(repoRoot);
    autopilot = new AutopilotEngine({
      repoRoot, settings, store: autopilotStore, logs, env,
      claudeAdapter: buildAdapter({ env, repoRoot }),
      dryRun: !settings.get().allowExec,
    });
    return autopilot;
  }

  function authOk(req) { return isAuthenticated(req, settings.get().authToken); }
  function send(res, code, body, extraHeaders = {}) {
    const json = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
    res.end(json);
  }
  function sendErr(res, code, message) { send(res, code, { error: message }); }

  async function readBody(req, max = 1_000_000) {
    return await new Promise((resolveP, rejectP) => {
      let total = 0;
      const chunks = [];
      req.on('data', (c) => {
        total += c.length;
        if (total > max) { rejectP(new Error('body too large')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        const buf = Buffer.concat(chunks).toString('utf8');
        if (!buf) return resolveP({});
        try { resolveP(JSON.parse(buf)); } catch { rejectP(new Error('invalid JSON body')); }
      });
      req.on('error', rejectP);
    });
  }

  function serveStatic(req, res) {
    const pubDir = resolve(__dirname, 'public');
    if (!existsSync(pubDir)) return false;
    const url = new URL(req.url, 'http://localhost');
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const target = normalize(join(pubDir, p));
    if (!target.startsWith(pubDir)) return false;
    if (!existsSync(target) || !statSync(target).isFile()) return false;
    const ext = extname(target).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(target));
    return true;
  }

  async function handleApi(req, res, url) {
    if (!authOk(req)) return sendErr(res, 401, 'unauthorized');
    const path = url.pathname;
    const method = req.method;

    if (method === 'GET' && (path === '/api/status' || path === '/api/health')) {
      const info = gitInfo(repoRoot);
      return send(res, 200, {
        ok: true, version: VERSION, branch: info.branch, dirty: info.dirty,
        activeRunId: runner.activeIds()[0] ?? null,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      });
    }
    if (method === 'GET' && path === '/api/network') {
      const lanIp = lanIPv4();
      const s = settings.get();
      const tokenSet = !!s.authToken;
      return send(res, 200, {
        host: network.host,
        port: network.port,
        lan: !!network.lan,
        lanEnabled: !!s.lanEnabled,
        lanIp,
        localUrl: `http://127.0.0.1:${network.port}`,
        lanUrl: network.lan && lanIp ? `http://${lanIp}:${network.port}` : null,
        tokenRequired: tokenSet,
      });
    }
    if (method === 'GET' && path === '/api/dashboard') {
      const info = gitInfo(repoRoot);
      const active = runner.activeIds()[0] ?? null;
      const last = state.list(1)[0] ?? null;
      return send(res, 200, {
        branch: info.branch,
        gitStatus: { clean: !info.dirty, ahead: 0, behind: 0, files: [] },
        doctor: { ok: null, phase: null, blockers: [], checkedAt: null },
        mainProtection: { enabled: null, type: 'unknown', checks: [] },
        phaseGates: { phase1: 'unknown', phase2: 'unknown', phase3: 'unknown' },
        openIssues: null,
        autonomousTasks: null,
        pendingQuestions: null,
        latestRun: last
          ? { id: last.id, status: last.exitCode == null ? 'running' : (last.exitCode === 0 ? 'done' : 'error'), startedAt: last.startedAt, endedAt: last.finishedAt }
          : { id: null, status: 'idle', startedAt: null, endedAt: null },
        activeRunId: active,
      });
    }
    if (method === 'GET' && path === '/api/settings') return send(res, 200, settings.redactedCopy());
    if (method === 'POST' && path === '/api/settings') {
      try {
        const body = await readBody(req);
        const next = settings.patch(body);
        const copy = { ...next }; delete copy.authToken;
        return send(res, 200, copy);
      } catch (e) { return sendErr(res, 422, e.message); }
    }

    if (method === 'POST' && path === '/api/command') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const r = resolveCommand(body?.name, Array.isArray(body?.args) ? body.args : []);
      if (r.error) return sendErr(res, 422, r.error);
      if (runner.hasActive()) return sendErr(res, 409, 'a run is already active');
      const id = runner.start(r);
      return send(res, 200, { runId: id, name: r.name, args: r.args });
    }

    if (method === 'POST' && path === '/api/run/plan') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const issue = Number(body?.issue);
      if (!Number.isInteger(issue) || issue <= 0) return sendErr(res, 422, 'invalid issue');
      const r = resolveCommand('task:run:plan', [`--issue=${issue}`]);
      if (r.error) return sendErr(res, 500, r.error);
      if (runner.hasActive()) return sendErr(res, 409, 'a run is already active');
      const id = runner.start(r);
      return send(res, 200, { runId: id });
    }

    if (method === 'POST' && path === '/api/run/start') {
      const s = settings.get();
      if (!s.allowExec) return sendErr(res, 403, 'allowExec disabled');
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const issue = Number(body?.issue);
      if (!Number.isInteger(issue) || issue <= 0) return sendErr(res, 422, 'invalid issue');
      const dryRun = body?.dryRun ?? s.dryRunDefault;
      if (dryRun !== false) {
        const r = resolveCommand('task:run:plan', [`--issue=${issue}`]);
        if (r.error) return sendErr(res, 500, r.error);
        if (runner.hasActive()) return sendErr(res, 409, 'a run is already active');
        const id = runner.start(r);
        return send(res, 200, { runId: id, dryRun: true });
      }
      return sendErr(res, 403, 'real execution not yet wired; use dryRun=true');
    }

    if (method === 'POST' && (path === '/api/run/stop' || path === '/api/runner/stop')) {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const id = String(body?.runId ?? runner.activeIds()[0] ?? '');
      const ok = runner.stop(id);
      return send(res, 200, { ok, stopped: ok });
    }

    if (method === 'POST' && path === '/api/runner/start') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const mode = String(body?.mode ?? 'plan');
      const issue = Number(body?.issue);
      if (!Number.isInteger(issue) || issue <= 0) return sendErr(res, 422, 'invalid issue');
      const s = settings.get();
      if (mode !== 'plan' && !s.allowExec) return sendErr(res, 403, 'allowExec disabled');
      if (mode === 'loop' && !s.allowLoop) return sendErr(res, 403, 'allowLoop disabled');
      const r = resolveCommand('task:run:plan', [`--issue=${issue}`]);
      if (r.error) return sendErr(res, 500, r.error);
      if (runner.hasActive()) return sendErr(res, 409, 'a run is already active');
      const id = runner.start(r);
      return send(res, 200, { runId: id, mode: mode === 'plan' ? 'plan' : 'plan-fallback' });
    }

    if (method === 'POST' && path === '/api/doctor/run') {
      const r = resolveCommand('task:doctor', []);
      if (runner.hasActive()) return sendErr(res, 409, 'a run is already active');
      const id = runner.start(r);
      return send(res, 200, { runId: id });
    }

    if (method === 'POST' && path === '/api/prompt') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const preset = body?.preset;
      const allowed = ['plan-next', 'run-one-safe', 'loop-safe', 'resume-after-answer', 'analyze-blockage'];
      if (preset != null && !allowed.includes(preset)) return sendErr(res, 422, 'invalid preset');
      const r = resolveCommand('task:queue', []);
      if (runner.hasActive()) return sendErr(res, 409, 'a run is already active');
      const id = runner.start(r);
      return send(res, 200, { runId: id, preset: preset ?? null });
    }

    if (method === 'GET' && path === '/api/tasks') {
      const r = spawnSync('pnpm', ['task:queue'], { cwd: repoRoot, encoding: 'utf8' });
      const tok = settings.get().authToken;
      if (r.status !== 0) return sendErr(res, 500, redactSecrets(r.stderr || 'queue failed', [tok]));
      let items = [];
      try {
        const parsed = JSON.parse(r.stdout);
        items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
      } catch { items = []; }
      return send(res, 200, { items });
    }

    if (method === 'POST' && /^\/api\/tasks\/\d+\/plan$/.test(path)) {
      const issue = Number(path.split('/')[3]);
      const r = resolveCommand('task:run:plan', [`--issue=${issue}`]);
      if (r.error) return sendErr(res, 422, r.error);
      if (runner.hasActive()) return sendErr(res, 409, 'a run is already active');
      const id = runner.start(r);
      return send(res, 200, { runId: id });
    }

    if (method === 'POST' && /^\/api\/questions\/[A-Za-z0-9_\-:]+\/answer$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const answer = String(body?.answer ?? '');
      if (!answer || answer.length > 8000) return sendErr(res, 422, 'invalid answer');
      const r = spawnSync('pnpm', ['task:questions', 'answer', '--id', id, '--answer', answer], {
        cwd: repoRoot, encoding: 'utf8',
      });
      const tok = settings.get().authToken;
      if (r.status !== 0) return sendErr(res, 500, redactSecrets(r.stderr || 'answer failed', [tok]));
      return send(res, 200, { ok: true });
    }

    if (method === 'PUT' && path === '/api/settings') {
      try {
        const body = await readBody(req);
        const next = settings.patch(body);
        const copy = { ...next }; delete copy.authToken;
        return send(res, 200, { ok: true, settings: copy });
      } catch (e) { return sendErr(res, 422, e.message); }
    }

    if (method === 'GET' && path === '/api/runs') return send(res, 200, { items: state.list() });

    if (method === 'GET' && /^\/api\/runs\/[A-Za-z0-9-]+\/events$/.test(path)) {
      const runId = path.split('/')[3];
      return streamLogs(req, res, runId);
    }
    if (method === 'GET' && /^\/api\/runs\/[A-Za-z0-9-]+$/.test(path)) {
      const runId = path.split('/')[3];
      const run = state.get(runId);
      if (!run) return sendErr(res, 404, 'run not found');
      const hist = logs.getHistory(runId);
      const stdout = hist.filter((h) => h.stream === 'stdout').map((h) => h.chunk).join('');
      const stderr = hist.filter((h) => h.stream === 'stderr').map((h) => h.chunk).join('');
      return send(res, 200, { id: run.id, status: run.exitCode == null ? 'running' : (run.exitCode === 0 ? 'done' : 'error'), stdout, stderr, exitCode: run.exitCode });
    }

    if (method === 'GET' && path.startsWith('/api/logs/')) {
      const runId = decodeURIComponent(path.slice('/api/logs/'.length));
      return streamLogs(req, res, runId);
    }

    if (method === 'GET' && path === '/api/questions') {
      const r = spawnSync('pnpm', ['task:questions:list', '--json'], { cwd: repoRoot, encoding: 'utf8' });
      const tok = settings.get().authToken;
      if (r.status !== 0) return sendErr(res, 500, redactSecrets(r.stderr || 'questions failed', [tok]));
      try { return send(res, 200, JSON.parse(r.stdout)); }
      catch { return send(res, 200, []); }
    }

    if (method === 'POST' && path === '/api/questions/answer') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const id = String(body?.id ?? '');
      const answer = String(body?.answer ?? '');
      if (!/^[A-Za-z0-9_\-:]+$/.test(id)) return sendErr(res, 422, 'invalid question id');
      if (!answer || answer.length > 8000) return sendErr(res, 422, 'invalid answer');
      const r = spawnSync('pnpm', ['task:questions', 'answer', '--id', id, '--answer', answer], {
        cwd: repoRoot, encoding: 'utf8',
      });
      const tok = settings.get().authToken;
      if (r.status !== 0) return sendErr(res, 500, redactSecrets(r.stderr || 'answer failed', [tok]));
      return send(res, 200, { ok: true, runId: null });
    }

    if (method === 'POST' && path === '/api/automerge/check') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const pr = Number(body?.pr);
      if (!Number.isInteger(pr) || pr <= 0) return sendErr(res, 422, 'invalid pr');
      const report = checkAutoMerge(pr);
      return send(res, 200, report);
    }

    if (method === 'POST' && path === '/api/automerge/apply') {
      const s = settings.get();
      if (!s.allowAutoMerge) return sendErr(res, 403, 'allowAutoMerge disabled');
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const pr = Number(body?.pr);
      if (!Number.isInteger(pr) || pr <= 0) return sendErr(res, 422, 'invalid pr');
      const report = checkAutoMerge(pr);
      if (!report.eligible) return send(res, 200, report);
      const m = applyAutoMerge(pr);
      report.applied = m.ok;
      if (!m.ok) report.reasons.push(`merge command failed: ${redactSecrets(m.stderr, [s.authToken])}`);
      return send(res, 200, report);
    }

    if (method === 'GET' && path === '/api/v5/status') {
      const s = settings.get();
      const { values: env } = loadV5Env(repoRoot);
      const envEval = evaluateV5Env(env);
      const claude = v5StatusFromEnv({ env, repoRoot });
      const notionCfg = evaluateNotionConfig(env);
      const n8nCfg = evaluateN8nConfig(env);
      const whatsappCfg = evaluateWhatsappConfig(env);
      const phaseStatus = {
        phase1: 'ready',
        phase2: claude.claudeAvailable ? 'ready' : 'pending',
        phase3: notionCfg.configured && n8nCfg.baseConfigured ? 'ready' : 'pending',
        phase4: 'pending',
      };
      const nextHumanActions = [];
      if (!claude.claudeAvailable) nextHumanActions.push(`Install/expose Claude Code CLI: ${claude.claudeReason ?? 'set CLAUDE_CODE_COMMAND'}`);
      if (!notionCfg.configured) nextHumanActions.push(`Fill Notion env: ${notionCfg.missing.join(', ')}`);
      if (!n8nCfg.baseConfigured) nextHumanActions.push(`Fill n8n env: ${n8nCfg.missing.join(', ')}`);
      if (n8nCfg.baseConfigured && n8nCfg.missingWebhooks.length) nextHumanActions.push(`Create/import n8n workflows then fill: ${n8nCfg.missingWebhooks.join(', ')}`);
      if (!whatsappCfg.configured) nextHumanActions.push(`Optional: configure WhatsApp (${whatsappCfg.missing.join(', ') || 'WHATSAPP_PROVIDER'})`);
      if (!s.allowExec) nextHumanActions.push('Enable allowExec in Settings to run real exec');
      if (!s.allowAutoMerge) nextHumanActions.push('Auto-merge stays OFF until explicitly enabled');
      const ap = autopilot?.current?.() ?? null;
      return send(res, 200, {
        claudeCommand: claude.claudeCommand,
        claudeAvailable: claude.claudeAvailable,
        claudeVersion: claude.claudeVersion,
        claudeReason: claude.claudeReason,
        execAllowed: !!s.allowExec,
        loopAllowed: !!s.allowLoop,
        autoMergeAllowed: !!s.allowAutoMerge,
        autoMergeMode: s.allowAutoMerge ? 'ENABLED' : 'OFF',
        notion: { stage: notionCfg.stage, summary: notionCfg.summary, missing: notionCfg.missing, configured: notionCfg.configured },
        n8n: {
          stage: n8nCfg.stage, summary: n8nCfg.summary,
          missing: n8nCfg.missing, missingWebhooks: n8nCfg.missingWebhooks,
          baseConfigured: n8nCfg.baseConfigured,
          webhooksConfigured: n8nCfg.questionWebhookConfigured && n8nCfg.answerWebhookConfigured,
        },
        whatsapp: { configured: whatsappCfg.configured, via: whatsappCfg.via, missing: whatsappCfg.missing },
        notionConfigured: notionCfg.configured,
        n8nConfigured: n8nCfg.baseConfigured,
        n8nWebhooksConfigured: n8nCfg.questionWebhookConfigured && n8nCfg.answerWebhookConfigured,
        n8nMissingWebhooks: n8nCfg.missingWebhooks,
        whatsappConfigured: whatsappCfg.configured,
        whatsappVia: whatsappCfg.via,
        missingEnv: envEval.missingEnv,
        missingByGroup: envEval.missingByGroup,
        phaseStatus,
        nextHumanActions,
        autopilot: ap,
      });
    }

    if (method === 'GET' && path === '/api/doctor/summary') {
      const out = runDoctorJson(repoRoot);
      if (!out.ok) return send(res, 200, { ok: false, reason: out.reason ?? 'doctor failed', summary: null });
      const summary = summarizeDoctor(out.report);
      return send(res, 200, { ok: true, summary, generatedAt: summary?.generatedAt ?? null });
    }

    if (method === 'GET' && path === '/api/tasks/best') {
      const queue = loadQueueItems(repoRoot);
      if (!queue.ok) return send(res, 200, { ok: false, reason: queue.reason ?? 'queue failed', best: null, blocked: [] });
      const { values: env } = loadV5Env(repoRoot);
      const claude = v5StatusFromEnv({ env, repoRoot });
      const sNow = settings.get();
      const result = selectBestTask({ items: queue.items, staleDays: sNow.staleDays, settings: sNow, claudeAvailable: !!claude.claudeAvailable });
      return send(res, 200, result);
    }

    if (method === 'GET' && path === '/api/v5/notion/validate') {
      const { values: env } = loadV5Env(repoRoot);
      const cfg = evaluateNotionConfig(env);
      if (!cfg.configured) return send(res, 200, { ok: false, configured: false, reason: `missing: ${cfg.missing.join(', ')}` });
      try {
        const out = await validateNotionDatabase({ token: cfg.token, databaseId: cfg.databaseId });
        return send(res, 200, { configured: true, ...out });
      } catch (e) { return send(res, 200, { configured: true, ok: false, reason: e.message }); }
    }

    if (method === 'GET' && path === '/api/v5/full-readiness') {
      const s = settings.get();
      const { values: env } = loadV5Env(repoRoot);
      const claude = v5StatusFromEnv({ env, repoRoot });
      const notionCfg = evaluateNotionConfig(env);
      const n8nCfg = evaluateN8nConfig(env);
      const whatsappCfg = evaluateWhatsappConfig(env);
      const items = [
        { id: 'claude', label: 'Claude CLI', kind: 'required', status: claude.claudeAvailable ? 'ready' : 'missing', detail: claude.claudeAvailable ? (claude.claudeVersion || 'available') : (claude.claudeReason || 'not available'), action: claude.claudeAvailable ? null : 'install-claude' },
        { id: 'protection', label: 'Branch protection', kind: 'required', status: 'unknown', detail: 'check via doctor', action: 'run-doctor' },
        { id: 'allowExec', label: 'Exec allowed', kind: 'required', status: s.allowExec ? 'ready' : 'missing', detail: s.allowExec ? 'autorisé' : 'flippe le toggle Exec dans Settings', action: 'open-settings-safety' },
        { id: 'allowLoop', label: 'Loop allowed', kind: 'required', status: s.allowLoop ? 'ready' : 'missing', detail: s.allowLoop ? 'autorisé' : 'flippe le toggle Loop dans Settings', action: 'open-settings-safety' },
        { id: 'allowAutoMerge', label: 'Auto-merge (Power mode)', kind: 'optional', status: s.allowAutoMerge ? 'ready' : 'optional', detail: s.allowAutoMerge ? 'ENABLED' : 'optionnel — laisser OFF par défaut', action: 'open-settings-safety' },
        { id: 'guard', label: 'Task guard', kind: 'required', status: 'unknown', detail: 'check via doctor', action: 'run-doctor' },
        { id: 'notion', label: 'Notion', kind: 'optional', status: notionCfg.configured ? 'ready' : 'optional', detail: notionCfg.summary, action: notionCfg.configured ? null : 'open-settings-integrations' },
        { id: 'n8n', label: 'n8n webhooks', kind: 'optional', status: n8nCfg.questionWebhookConfigured && n8nCfg.answerWebhookConfigured ? 'ready' : 'optional', detail: n8nCfg.summary, action: 'open-settings-integrations' },
        { id: 'whatsapp', label: 'WhatsApp', kind: 'optional', status: whatsappCfg.configured ? 'ready' : 'optional', detail: whatsappCfg.configured ? `via ${whatsappCfg.via ?? 'on'}` : 'optionnel — notifications mobile', action: 'open-settings-integrations' },
      ];
      const requiredMissing = items.filter((i) => i.kind === 'required' && i.status !== 'ready' && i.status !== 'unknown');
      return send(res, 200, {
        items,
        requiredMissingCount: requiredMissing.length,
        ready: requiredMissing.length === 0,
        summary: requiredMissing.length === 0 ? 'Full autopilot ready' : `${requiredMissing.length} required item(s) missing`,
      });
    }

    if (method === 'POST' && path === '/api/autopilot/start') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const mode = ['plan', 'exec', 'loop'].includes(body?.mode) ? body.mode : 'plan';
      const issue = body?.issue == null ? null : Number(body.issue);
      if (issue != null && (!Number.isInteger(issue) || issue <= 0)) return sendErr(res, 422, 'invalid issue');
      const ap = getAutopilot();
      ap.dryRun = !settings.get().allowExec || mode === 'plan';
      const result = await ap.start({ mode, issue });
      return send(res, result.ok ? 200 : 409, result);
    }
    if (method === 'POST' && path === '/api/autopilot/stop') {
      const ap = getAutopilot();
      const result = ap.stop();
      return send(res, 200, result);
    }
    if (method === 'POST' && path === '/api/autopilot/resume') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const ap = getAutopilot();
      const result = ap.resume({ answeredQid: body?.answeredQid ?? null });
      return send(res, result.ok ? 200 : 409, result);
    }
    if (method === 'GET' && path === '/api/autopilot/status') {
      const ap = getAutopilot();
      return send(res, 200, { autopilot: ap.current() });
    }
    if (method === 'GET' && path === '/api/autopilot/events') {
      const ap = getAutopilot();
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      const sendEvt = (event, payload) => { res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(payload)}\n\n`); };
      sendEvt('state', ap.current() ?? null);
      const unsub = ap.subscribe((event, payload) => sendEvt(event, payload));
      req.on('close', () => unsub());
      return;
    }

    if (method === 'POST' && path === '/api/v5/prepare-run') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const issue = Number(body?.issue);
      if (!Number.isInteger(issue) || issue <= 0) return sendErr(res, 422, 'invalid issue');
      const mode = ['plan', 'exec', 'loop'].includes(body?.mode) ? body.mode : 'plan';
      const { values: env } = loadV5Env(repoRoot);
      const prep = prepareClaudeRun({ issue, mode, repoRoot, env });
      const id = v5Store.newId();
      const record = v5Store.save({
        id,
        issue,
        mode,
        status: 'prepared',
        ready: prep.ready,
        reason: prep.reason,
        branch: prep.branch,
        prompt: prep.prompt,
        proposedCommands: prep.proposedCommands,
        createdAt: new Date().toISOString(),
      });
      return send(res, 200, { runId: id, ...prep, record });
    }

    if (method === 'GET' && path === '/api/state') {
      const items = v5Store.list({ limit: 30 });
      return send(res, 200, { items, latest: items[0] ?? null });
    }

    if (method === 'POST' && path === '/api/resume') {
      let body; try { body = await readBody(req); } catch (e) { return sendErr(res, 422, e.message); }
      const id = String(body?.runId ?? '');
      const run = id ? v5Store.load(id) : v5Store.latest();
      let questions = [];
      const r = spawnSync('pnpm', ['task:questions:list', '--json'], { cwd: repoRoot, encoding: 'utf8' });
      if (r.status === 0) { try { const j = JSON.parse(r.stdout); questions = Array.isArray(j) ? j : (j.items ?? []); } catch { /* ignore */ } }
      const evald = evaluateResume({ run, questions });
      return send(res, 200, evald);
    }

    return sendErr(res, 404, 'not found');
  }

  function checkAutoMerge(pr) {
    const s = settings.get();
    const prData = fetchPrContext(pr);
    const linked = Array.isArray(prData?.closingIssuesReferences) ? prData.closingIssuesReferences[0] : null;
    const issueLabels = linked?.number ? fetchIssueLabels(linked.number) : null;
    const repo = repoNameWithOwner(repoRoot);
    const baseBranch = prData?.baseRefName ?? 'main';
    const branchProtection = repo ? fetchBranchProtection(repo, baseBranch) : { protected: false };
    const guardResult = runTaskGuard(repoRoot, prData?.headRefName);
    return evaluateAutoMerge({ pr, settings: s, prData, issueLabels, branchProtection, guardResult });
  }

  function streamLogs(req, res, runId) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    const send = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    for (const h of logs.getHistory(runId)) send('log', { runId, stream: h.stream, chunk: h.chunk });
    const run = state.get(runId);
    if (run?.exitCode != null) { send('exit', { runId, code: run.exitCode }); res.end(); return; }
    const unsub = state.subscribe(runId, (event, payload) => {
      send(event, payload);
      if (event === 'exit') { unsub(); res.end(); }
    });
    req.on('close', () => unsub());
  }

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
      if (req.method === 'GET' && serveStatic(req, res)) return;
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end(`local-control v${VERSION}\nAPI at /api/*. UI not bundled.\n`);
      }
      sendErr(res, 404, 'not found');
    } catch (e) {
      sendErr(res, 500, 'internal error');
    }
  };

  return { handler, settings, state, logs, runner, repoRoot, network };
}

export function startServer({ port = 8787, lan = false, repoRoot = REPO_ROOT_DEFAULT } = {}) {
  const app = buildApp({ repoRoot });
  const settings = app.settings.get();
  const wantLan = lan && settings.lanEnabled;
  if (lan && !settings.lanEnabled) {
    console.error('[local-control] --lan ignored: settings.lanEnabled is false');
  }
  const host = wantLan ? '0.0.0.0' : '127.0.0.1';
  app.network.host = host;
  app.network.port = port;
  app.network.lan = wantLan;
  const server = createServer(app.handler);
  server.listen(port, host, () => {
    console.log(`[local-control] http://${host}:${port}`);
    console.log(`[local-control] auth token in .local-control/settings.json (chmod 600)`);
  });
  return { server, app };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const portArg = args.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.slice(7)) : 8787;
  startServer({ port, lan });
}
