// Cockpit V5 — central rendering helpers for the new IA.
// Pure DOM, no fetch. Driven by app.js with backend payloads.

export function renderTopbar({ conn, settings, lan }) {
  const dot = document.getElementById('conn-dot');
  if (dot) {
    dot.classList.remove('ok', 'err', 'warn');
    if (conn === 'connected') dot.classList.add('ok');
    else if (conn === 'auth-required' || conn === 'offline') dot.classList.add('err');
  }
  const badge = document.getElementById('conn-badge');
  if (badge) {
    badge.textContent =
      conn === 'connected' ? 'connecté' :
      conn === 'auth-required' ? 'auth requise' :
      conn === 'offline' ? 'offline' : '…';
    badge.classList.remove('ok', 'err', 'warn');
    if (conn === 'connected') badge.classList.add('ok');
    else if (conn === 'auth-required' || conn === 'offline') badge.classList.add('err');
  }
  const mode = document.getElementById('mode-badge');
  if (mode && settings) {
    const dry = !!settings.dryRunDefault;
    mode.textContent = dry ? 'DRY-RUN' : 'LIVE';
    mode.classList.toggle('dry', dry);
    mode.classList.toggle('live', !dry);
  }
  document.getElementById('lan-badge')?.classList.toggle('hidden', !(lan === true || settings?.lanEnabled));
  document.getElementById('automerge-badge')?.classList.toggle('hidden', !settings?.allowAutoMerge);
}

export function renderStatusGrid({ conn, settings, v5, network, dashboard }) {
  const map = {
    server: pill(conn === 'connected' ? 'ok' : 'err', conn === 'connected' ? 'En ligne' : 'Hors ligne'),
    auth: pill(conn === 'auth-required' ? 'err' : conn === 'connected' ? 'ok' : 'warn',
      conn === 'auth-required' ? 'Token requis' : conn === 'connected' ? 'OK' : '…'),
    claude: v5 ? pill(v5.claudeAvailable ? 'ok' : 'err', v5.claudeAvailable ? (v5.claudeVersion || 'OK') : 'Indispo') : pill('warn', '…'),
    branch: pill(dashboard?.branch === 'main' ? 'ok' : 'warn', dashboard?.branch ?? '—'),
    protection: pill(dashboard?.mainProtection?.enabled ? 'ok' : dashboard?.mainProtection?.enabled === false ? 'err' : 'warn',
      dashboard?.mainProtection?.enabled === true ? 'protected' : dashboard?.mainProtection?.enabled === false ? 'off' : '?'),
    exec: pill(settings?.allowExec ? 'warn' : 'ok', settings?.allowExec ? 'autorisé' : 'bloqué'),
    loop: pill(settings?.allowLoop ? 'warn' : 'ok', settings?.allowLoop ? 'autorisé' : 'bloqué'),
    automerge: pill(settings?.allowAutoMerge ? 'warn' : 'ok', settings?.allowAutoMerge ? 'ENABLED' : 'OFF'),
    notion: v5 ? pill(v5.notionConfigured ? 'ok' : 'warn', v5.notionConfigured ? 'configuré' : 'à configurer') : pill('warn', '…'),
    n8n: v5 ? pill(v5.n8nConfigured ? 'ok' : 'warn', v5.n8nConfigured ? (v5.n8nWebhooksConfigured ? 'live' : 'partial') : 'à configurer') : pill('warn', '…'),
    whatsapp: v5 ? pill(v5.whatsappConfigured ? 'ok' : 'warn', v5.whatsappConfigured ? (v5.whatsappVia ?? 'on') : 'optionnel') : pill('warn', '…'),
    lan: pill(network?.lan ? 'ok' : 'warn', network?.lan ? (network.lanIp ?? 'on') : 'local only'),
  };
  const grid = document.getElementById('status-grid');
  if (!grid) return;
  for (const li of grid.querySelectorAll('[data-key]')) {
    const k = li.dataset.key;
    const m = map[k];
    if (!m) continue;
    li.classList.remove('ok', 'warn', 'err');
    li.classList.add(m.cls);
    const v = li.querySelector('[data-value]');
    if (v) v.textContent = m.text;
  }
  // next actions
  const next = document.getElementById('next-actions');
  if (next) {
    const actions = v5?.nextHumanActions ?? [];
    next.innerHTML = actions.length
      ? actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')
      : '<li class="muted">Tout est prêt.</li>';
  }
}

function pill(cls, text) { return { cls, text }; }

export function renderMetrics(dashboard) {
  if (!dashboard) return;
  set('metric-issues', dashboard.openIssues ?? '—');
  set('metric-auto', dashboard.autonomousTasks != null ? `${dashboard.autonomousTasks} autonomes` : '—');
  set('metric-questions', dashboard.pendingQuestions ?? '—');
  const dr = dashboard.doctor ?? {};
  set('metric-doctor', dr.ok === true ? 'green' : dr.ok === false ? 'red' : '—');
  set('metric-doctor-sub', (dr.blockers ?? []).length ? `${dr.blockers.length} blockers` : 'aucun blocker');
  const lr = dashboard.latestRun ?? {};
  set('metric-latest', lr.status ?? 'idle');
  set('metric-latest-sub', lr.startedAt ? new Date(lr.startedAt).toLocaleTimeString() : '—');
}

function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; }

export function renderAutopilot({ ap, v5, settings }) {
  const card = document.getElementById('autopilot-card');
  if (!card) return;
  const badge = document.getElementById('autopilot-status-badge');
  const status = ap?.status ?? 'idle';
  if (badge) {
    badge.textContent = status === 'running' ? 'en cours' : status === 'waiting' ? 'attente humaine' : status === 'completed' ? 'terminé' : status === 'stopped' ? 'arrêté' : 'idle';
    badge.classList.remove('ok', 'warn', 'danger', 'accent');
    if (status === 'running') badge.classList.add('accent');
    else if (status === 'waiting') badge.classList.add('warn');
    else if (status === 'stopped') badge.classList.add('danger');
    else if (status === 'completed') badge.classList.add('ok');
  }
  const stats = document.getElementById('autopilot-stats');
  if (stats) {
    setMeta(stats, 'status', status);
    setMeta(stats, 'mode', ap?.mode ?? '—');
    setMeta(stats, 'issue', ap?.issue ? `#${ap.issue}` : '—');
    setMeta(stats, 'prs', String(ap?.prsCreated ?? 0));
    setMeta(stats, 'errors', String(ap?.errors ?? 0));
    setMeta(stats, 'next', ap?.nextAction ?? '—');
    const am = v5?.autoMergeMode ?? (settings?.allowAutoMerge ? 'ENABLED' : 'OFF');
    setMeta(stats, 'automerge', am);
  }
  const promptEl = document.getElementById('autopilot-prompt');
  if (promptEl) {
    if (ap?.lastPrompt) {
      promptEl.textContent = ap.lastPrompt;
      promptEl.classList.remove('hidden');
    } else if (!ap || ap.status === 'idle') {
      promptEl.classList.add('hidden');
    }
  }
  // blocker banner
  const banner = document.getElementById('autopilot-blocker');
  const reasons = collectBlockers({ ap, v5, settings });
  if (banner) {
    if (reasons.length) {
      banner.classList.remove('hidden');
      banner.classList.toggle('danger', reasons.some((r) => r.kind === 'danger'));
      const list = document.getElementById('autopilot-blocker-list');
      if (list) list.innerHTML = reasons.map((r) => `<li>${escapeHtml(r.text)}</li>`).join('');
      const title = document.getElementById('autopilot-blocker-title');
      if (title) title.textContent = ap?.status === 'waiting' ? 'En attente humaine' : ap?.status === 'stopped' ? 'Arrêté' : 'Pré-requis manquants';
    } else {
      banner.classList.add('hidden');
    }
  }
}

function setMeta(root, key, val) {
  const el = root.querySelector(`[data-key="${key}"]`);
  if (el) el.textContent = String(val ?? '—');
}

function collectBlockers({ ap, v5, settings }) {
  const out = [];
  if (v5 && !v5.claudeAvailable) out.push({ kind: 'warn', text: `Claude CLI indispo : ${v5.claudeReason ?? 'CLAUDE_CODE_COMMAND non défini'}` });
  if (settings && !settings.allowExec) out.push({ kind: 'info', text: 'allowExec désactivé — autopilot reste en mode prompt-only' });
  if (ap?.status === 'stopped' && ap?.stopReason) out.push({ kind: 'danger', text: `Stoppé : ${ap.stopReason}` });
  if (ap?.status === 'waiting' && ap?.pendingQuestionId) out.push({ kind: 'warn', text: `Question en attente : ${ap.pendingQuestionId}` });
  if (ap?.errors >= 1) out.push({ kind: 'warn', text: `${ap.errors} erreur(s) accumulée(s)` });
  return out;
}

export function renderPhone(network) {
  const local = document.getElementById('phone-local');
  const lan = document.getElementById('phone-lan');
  const hint = document.getElementById('phone-hint');
  if (local) local.textContent = network?.localUrl ?? `http://127.0.0.1:${network?.port ?? 8787}`;
  if (lan) lan.textContent = network?.lanUrl ?? '— (LAN désactivé)';
  if (hint) {
    hint.textContent = network?.lan
      ? `LAN actif sur ${network.lanIp ?? '?'}. Scanne le code dans ton navigateur mobile.`
      : 'Active LAN dans Settings + relance avec pnpm cockpit:lan.';
  }
}

export function showToast(msg, kind = '') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 200ms ease'; }, 2400);
  setTimeout(() => { t.remove(); }, 2700);
}

export function bindToggles(form) {
  if (!form) return;
  for (const wrap of form.querySelectorAll('.toggle')) {
    const input = wrap.querySelector('input[type="checkbox"]');
    if (!input) continue;
    const sync = () => wrap.classList.toggle('on', input.checked);
    sync();
    input.addEventListener('change', sync);
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
