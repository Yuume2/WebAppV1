import { spawnSync } from 'node:child_process';
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

export function buildIssuePrompt({ issue, mode = 'plan', repoRoot }) {
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('invalid issue');
  const safeMode = ['plan', 'exec', 'loop'].includes(mode) ? mode : 'plan';
  const lines = [
    `Tu es Claude Code dans WebAppV1 (${resolve(repoRoot)}).`,
    `Mode: ${safeMode}.`,
    `Issue cible: #${issue}.`,
    '',
    'Étapes obligatoires :',
    '1. `git switch main && git pull --ff-only`',
    `2. Créer une branche \`feat/issue-${issue}-<slug>\``,
    `3. Lire l'issue #${issue} via \`gh issue view ${issue}\``,
    '4. Lire `project-memory/03-current-state.md` puis les fichiers cités dans l\'issue.',
    '5. Implémenter sans toucher à `.claude/`.',
    safeMode === 'plan'
      ? '6. PLAN ONLY : produire un plan détaillé sans modifier de code.'
      : '6. Implémenter, lancer `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.',
    safeMode !== 'plan' ? '7. Commit conventional, ne pas push, ne pas merge.' : '7. Ne pas commit.',
    '',
    'Contraintes :',
    '- Ne push rien.',
    '- Pas d\'auto-merge.',
    '- Pas de loop sans flag explicite.',
    '- Aucun secret en git.',
  ];
  return lines.join('\n');
}

export function prepareClaudeRun({ issue, mode = 'plan', repoRoot, env }) {
  const resolved = resolveClaudeCommand(env);
  const prompt = buildIssuePrompt({ issue, mode, repoRoot });
  const branch = `feat/issue-${issue}-claude-${mode}`;
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
