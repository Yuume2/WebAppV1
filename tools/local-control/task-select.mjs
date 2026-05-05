import { chooseSafeTask, AUTOPILOT_BLOCK_LABELS, AUTOPILOT_REQUIRED_LABELS } from './autopilot.mjs';

export function classifyTaskBlockers(item) {
  if (!item) return { safe: false, reasons: ['no item'] };
  const labels = (item.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
  const reasons = [];
  for (const r of AUTOPILOT_REQUIRED_LABELS) {
    if (!labels.includes(r)) reasons.push(`label manquant: ${r}`);
  }
  for (const b of AUTOPILOT_BLOCK_LABELS) {
    if (labels.includes(b)) reasons.push(`label bloquant: ${b}`);
  }
  if (item.stale === true) reasons.push('issue marquée stale');
  return { safe: reasons.length === 0, reasons, labels };
}

export function selectBestTask({ items = [], staleDays = 7, settings = {}, claudeAvailable = true }) {
  const all = Array.isArray(items) ? items : [];
  const best = chooseSafeTask({ items: all, staleDays });
  const blocked = all
    .filter((t) => t && t !== best && Number.isInteger(t.number))
    .map((t) => ({
      number: t.number,
      title: t.title ?? '',
      score: t.score ?? null,
      classification: t.classification ?? null,
      ...classifyTaskBlockers(t),
    }));

  if (!best) {
    return {
      ok: false,
      reason: all.length === 0 ? 'aucune issue ouverte' : 'aucune issue ne passe les filtres autopilot',
      best: null,
      blocked,
      runnability: null,
    };
  }
  const runnability = evaluateRunnability({ task: best, settings, claudeAvailable });
  return {
    ok: true,
    best: {
      number: best.number,
      title: best.title ?? '',
      score: best.score ?? null,
      classification: best.classification ?? null,
      labels: (best.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
      reason: 'passe les filtres ai:autonomous + risk:safe, hors labels bloquants',
      url: best.url ?? null,
    },
    blocked,
    runnability,
  };
}

export function evaluateRunnability({ task, settings, claudeAvailable }) {
  const blockers = [];
  if (!task) return { canPlan: false, canExec: false, blockers: ['no task'] };
  if (!claudeAvailable) blockers.push('Claude CLI indispo');
  if (!settings?.allowExec) blockers.push('allowExec=false → mode prompt-only');
  return {
    canPlan: !!task,
    canExec: !!task && claudeAvailable && !!settings?.allowExec,
    blockers,
  };
}
