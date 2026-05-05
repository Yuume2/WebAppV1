import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadV5Env } from './v5-env.mjs';

const SAFE_COMMAND_RE = /^[A-Za-z0-9_.\-]+$/;
const VERSION_TIMEOUT_MS = 5000;

export function resolveClaudeCommand(env) {
  const cmd = (env?.CLAUDE_CODE_COMMAND ?? '').trim();
  if (!cmd) return { ok: false, reason: 'CLAUDE_CODE_COMMAND not set' };
  if (!SAFE_COMMAND_RE.test(cmd)) return { ok: false, reason: 'CLAUDE_CODE_COMMAND has unsafe characters' };
  return { ok: true, command: cmd };
}

export function probeClaudeAvailability({ command, shellEnv = process.env }) {
  if (!command) return { available: false, version: null, reason: 'no command' };
  const which = spawnSync('command', ['-v', command], { encoding: 'utf8', shell: '/bin/zsh', env: shellEnv });
  const fallback = spawnSync('which', [command], { encoding: 'utf8', env: shellEnv });
  const located = (which.status === 0 && which.stdout.trim()) || (fallback.status === 0 && fallback.stdout.trim());
  if (!located) {
    const shellLookup = spawnSync('/bin/zsh', ['-i', '-c', `command -v ${command} || true`], { encoding: 'utf8', env: shellEnv, timeout: VERSION_TIMEOUT_MS });
    if (!shellLookup.stdout.trim()) return { available: false, version: null, reason: `${command} not found in PATH or shell` };
  }
  const v = spawnSync('/bin/zsh', ['-i', '-c', `${command} --version 2>/dev/null`], { encoding: 'utf8', env: shellEnv, timeout: VERSION_TIMEOUT_MS });
  const lines = (v.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const versionLine = lines.find((l) => /\d+\.\d+/.test(l) && !/Restored session|Welcome|Loading/i.test(l)) ?? null;
  return { available: true, version: versionLine, reason: null };
}

export function buildIssuePrompt({ issue, mode = 'plan', repoRoot, branch }) {
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('invalid issue');
  const safeMode = ['plan', 'exec', 'loop'].includes(mode) ? mode : 'plan';
  const targetBranch = branch || `feat/issue-${issue}-autopilot`;
  const lines = [
    `Tu es Claude Code, en autopilot WebAppV1 (${resolve(repoRoot)}).`,
    `Mode demandé : ${safeMode}.`,
    `Issue cible : #${issue}.`,
    `Branche dédiée : ${targetBranch} (déjà créée par le superviseur).`,
    '',
    'Règles inviolables :',
    '- Ne jamais toucher à `.claude/`.',
    '- Ne jamais commiter `.local-control/` ou un secret.',
    '- Jamais de force-push, --admin, ou push direct sur main.',
    '- Pas d\'auto-merge.',
    '- Pas de migration DB destructive, pas de désactivation auth/sécurité.',
    '- Si tu es bloqué : poste un commentaire `<!-- claude-question v1 ... -->` sur l\'issue avec options + recommandation, puis ARRÊTE-TOI.',
    '',
    'Procédure :',
    `1. \`gh issue view ${issue}\` pour relire l'AC.`,
    '2. Lis `project-memory/03-current-state.md` puis les fichiers cités dans l\'issue.',
    '3. Implémente strictement la task — pas de feature bonus.',
    '4. Lance les tests pertinents (au minimum `pnpm typecheck && pnpm test && pnpm lint && pnpm build`).',
    '5. Lance `pnpm task:guard` — refuse si BLOCK.',
    safeMode === 'plan'
      ? '6. PLAN-ONLY : ne modifie aucun fichier. Produis un plan structuré et stop.'
      : '6. `git add` les changements pertinents (jamais `.local-control/`, jamais secrets).',
    safeMode === 'plan'
      ? '7. Termine en disant "PLAN OK".'
      : `7. Commit conventionnel : \`feat(scope): ...\` ou \`fix(scope): ...\` mentionnant #${issue}.`,
    safeMode === 'plan'
      ? '8. (rien de plus)'
      : `8. Push la branche : \`git push -u origin ${targetBranch}\`.`,
    safeMode === 'plan'
      ? ''
      : `9. \`gh pr create --base main --head ${targetBranch}\` avec un body qui décrit clairement summary + test plan + closes #${issue}.`,
    safeMode === 'plan'
      ? ''
      : '10. STOP après l\'ouverture de la PR. N\'essaie pas de merger, ni de continuer sur une autre issue.',
  ].filter(Boolean);
  return lines.join('\n');
}

export function prepareClaudeRun({ issue, mode = 'plan', repoRoot, env }) {
  const resolved = resolveClaudeCommand(env);
  const branch = `feat/issue-${issue}-autopilot`;
  const prompt = buildIssuePrompt({ issue, mode, repoRoot, branch });
  const proposedCommands = [
    'git switch main',
    'git pull --ff-only',
    `git switch -c ${branch}`,
    `gh issue view ${issue}`,
  ];
  return {
    ready: resolved.ok,
    reason: resolved.ok ? null : resolved.reason,
    command: resolved.ok ? resolved.command : null,
    mode,
    issue,
    branch,
    prompt,
    proposedCommands,
  };
}

export function v5StatusFromEnv({ env, repoRoot }) {
  const resolved = resolveClaudeCommand(env);
  let probe = { available: false, version: null, reason: resolved.ok ? null : resolved.reason };
  if (resolved.ok) probe = probeClaudeAvailability({ command: resolved.command });
  return {
    claudeCommand: resolved.ok ? resolved.command : null,
    claudeAvailable: probe.available,
    claudeVersion: probe.version,
    claudeReason: probe.reason ?? resolved.reason ?? null,
    repoRoot,
  };
}

export function loadAdapterContext(repoRoot) {
  const { values, file, exists } = loadV5Env(repoRoot);
  return { env: values, envFile: file, envExists: exists, envFileExists: exists && existsSync(file) };
}

const SAFE_PROMPT_RE = /^[\s\S]{1,32000}$/;

export function launchClaude({ prompt, command, repoRoot, env = {}, allowExec = false }) {
  if (!allowExec) return { ok: false, reason: 'exec not allowed' };
  if (!command || !SAFE_COMMAND_RE.test(command)) return { ok: false, reason: 'unsafe command' };
  if (!prompt || !SAFE_PROMPT_RE.test(prompt)) return { ok: false, reason: 'invalid prompt' };
  if (!resolve(repoRoot)) return { ok: false, reason: 'invalid repoRoot' };
  const childEnv = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && v.length) childEnv[k] = v;
  }
  const escaped = prompt.replace(/'/g, `'\\''`);
  const shellCmd = `${command} -p '${escaped}'`;
  let child;
  try {
    child = spawn('/bin/zsh', ['-i', '-c', shellCmd], {
      cwd: repoRoot,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return { ok: false, reason: `spawn failed: ${err.message}` };
  }
  return { ok: true, child };
}

export function buildAdapter({ env = {}, repoRoot }) {
  const resolved = resolveClaudeCommand(env);
  const probe = resolved.ok ? probeClaudeAvailability({ command: resolved.command }) : { available: false, version: null, reason: resolved.reason };
  return {
    available: !!probe.available,
    command: resolved.ok ? resolved.command : null,
    version: probe.version,
    reason: probe.reason,
    prepare(args) { return prepareClaudeRun({ ...args, repoRoot, env }); },
    launch(args) { return launchClaude({ ...args, env, allowExec: true }); },
  };
}
