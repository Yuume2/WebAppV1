export function renderAutopilotState(card, state, v5) {
  if (!card) return;
  const badge = card.querySelector('#autopilot-status-badge');
  const stats = card.querySelector('#autopilot-stats');
  const prompt = card.querySelector('#autopilot-prompt');
  const ap = state || null;
  if (badge) {
    const status = ap?.status ?? 'idle';
    badge.textContent = status;
    if (badge.classList) {
      badge.classList.remove('ok', 'warn', 'danger');
      const cls = status === 'running' ? 'ok' : status === 'waiting' ? 'warn' : status === 'stopped' ? 'danger' : null;
      if (cls) badge.classList.add(cls);
    }
  }
  if (stats) {
    setValue(stats, 'mode', ap?.mode ?? '—');
    setValue(stats, 'issue', ap?.issue ?? '—');
    setValue(stats, 'prs', String(ap?.prsCreated ?? 0));
    setValue(stats, 'errors', String(ap?.errors ?? 0));
    setValue(stats, 'next', ap?.nextAction ?? '—');
    const am = v5?.autoMergeMode ?? (v5?.autoMergeAllowed ? 'ENABLED' : 'OFF');
    setValue(stats, 'automerge', am);
  }
  if (prompt && ap?.lastPrompt) {
    prompt.textContent = ap.lastPrompt;
    prompt.classList.remove('hidden');
  }
}

function setValue(root, key, val) {
  const el = root.querySelector(`[data-key="${key}"]`);
  if (el) el.textContent = String(val ?? '—');
}

export async function startAutopilot(api, { mode = 'plan', issue = null } = {}) {
  return api.post('/api/autopilot/start', { mode, issue });
}
export async function stopAutopilot(api) {
  return api.post('/api/autopilot/stop', {});
}
export async function resumeAutopilot(api, answeredQid = null) {
  return api.post('/api/autopilot/resume', { answeredQid });
}
export async function fetchAutopilotStatus(api) {
  return api.get('/api/autopilot/status');
}
