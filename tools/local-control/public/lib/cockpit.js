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
  const notion = v5?.notion ?? null;
  const n8n = v5?.n8n ?? null;
  const whatsapp = v5?.whatsapp ?? null;
  const map = {
    server: pill(conn === 'connected' ? 'ok' : 'err', conn === 'connected' ? 'En ligne' : 'Hors ligne'),
    auth: pill(conn === 'auth-required' ? 'err' : conn === 'connected' ? 'ok' : 'warn',
      conn === 'auth-required' ? 'Token requis' : conn === 'connected' ? 'OK' : '…'),
    claude: v5 ? pill(v5.claudeAvailable ? 'ok' : 'err', v5.claudeAvailable ? (v5.claudeVersion || 'OK') : 'Indispo') : pill('warn', '…'),
    branch: pill(dashboard?.branch === 'main' ? 'ok' : 'warn', dashboard?.branch ?? '—'),
    protection: pill(
      dashboard?.mainProtection?.enabled === true ? 'ok'
      : dashboard?.mainProtection?.enabled === false ? 'err' : 'warn',
      dashboard?.mainProtection?.enabled === true ? 'protected'
      : dashboard?.mainProtection?.enabled === false ? 'off'
      : 'not checked'),
    exec: pill(settings?.allowExec ? 'warn' : 'ok', settings?.allowExec ? 'autorisé' : 'bloqué'),
    loop: pill(settings?.allowLoop ? 'warn' : 'ok', settings?.allowLoop ? 'autorisé' : 'bloqué'),
    automerge: pill(settings?.allowAutoMerge ? 'warn' : 'ok', settings?.allowAutoMerge ? 'ENABLED' : 'OFF'),
    notion: pillForNotion(notion ?? { stage: v5?.notionConfigured ? 'configured' : 'missing-all', summary: v5?.notionConfigured ? 'configured' : 'not configured' }),
    n8n: pillForN8n(n8n ?? { stage: 'unknown', summary: '…' }),
    whatsapp: pillForWhatsapp(whatsapp ?? { configured: !!v5?.whatsappConfigured, via: v5?.whatsappVia }),
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
function pillForNotion(n) {
  if (!n || n.stage === 'unknown') return pill('warn', '…');
  if (n.stage === 'configured') return pill('ok', 'configured');
  if (n.stage === 'missing-token') return pill('err', 'missing token');
  if (n.stage === 'missing-database-id') return pill('err', 'missing DB id');
  return pill('warn', n.summary || 'not configured');
}
function pillForN8n(n) {
  if (!n || n.stage === 'unknown') return pill('warn', '…');
  if (n.stage === 'configured') return pill('ok', 'configured');
  if (n.stage === 'partial-webhooks') return pill('warn', 'webhooks partiels');
  if (n.stage === 'base-only') return pill('warn', 'base ok, webhooks ø');
  if (n.stage === 'missing-secret') return pill('err', 'missing secret');
  if (n.stage === 'missing-base') return pill('warn', 'base manquante');
  return pill('warn', n.summary || 'not configured');
}
function pillForWhatsapp(w) {
  if (!w) return pill('warn', '…');
  if (w.configured) return pill('ok', w.via || 'on');
  return pill('warn', 'optionnel');
}

export function renderDoctor(summary) {
  const card = document.getElementById('doctor-card');
  if (!card) return;
  const empty = document.getElementById('doctor-empty');
  const result = document.getElementById('doctor-result');
  if (!summary) {
    if (empty) empty.classList.remove('hidden');
    if (result) result.classList.add('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  if (result) result.classList.remove('hidden');
  const badge = document.getElementById('doctor-status-badge');
  if (badge) {
    badge.textContent = summary.ok ? 'green' : (summary.failed?.length ? 'red' : 'warn');
    badge.classList.remove('ok', 'warn', 'danger');
    badge.classList.add(summary.ok ? 'ok' : (summary.failed?.length ? 'danger' : 'warn'));
  }
  const gen = document.getElementById('doctor-generated');
  if (gen) gen.textContent = summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '—';
  const checks = document.getElementById('doctor-checks');
  if (checks) {
    checks.innerHTML = (summary.checks || []).map((c) => {
      const cls = c.status === 'ok' ? 'ok' : c.status === 'fail' ? 'err' : c.status === 'warn' ? 'warn' : '';
      return `<li class="status-pill ${cls}"><span class="dot"></span><span class="label">${escapeHtml(c.label)}</span><span class="value">${escapeHtml(c.detail ?? '—')}</span></li>`;
    }).join('');
  }
  const phaseMap = { phase1: 'doctor-phase-1', phase2: 'doctor-phase-2', phase3: 'doctor-phase-3', phase4: 'doctor-phase-4' };
  for (const [k, id] of Object.entries(phaseMap)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const ready = summary.phaseSummary?.[k]?.ready;
    el.textContent = `P${k.replace('phase', '')} · ${ready ? 'ready' : 'pending'}`;
    el.classList.remove('ok', 'warn');
    el.classList.add(ready ? 'ok' : 'warn');
  }
  const recos = document.getElementById('doctor-recos');
  if (recos) recos.innerHTML = (summary.recommendations ?? []).length ? summary.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('') : '<li class="muted">Aucune.</li>';
  const blockers = document.getElementById('doctor-blockers');
  if (blockers) {
    blockers.innerHTML = (summary.blockers ?? []).length
      ? summary.blockers.map((b) => `<li><strong>${escapeHtml(b.phase)}</strong> · ${escapeHtml(b.blocker)}</li>`).join('')
      : '<li class="muted">Aucun blocker.</li>';
  }
}

export function renderSelectedTask(result) {
  const body = document.getElementById('selected-task-body');
  const promptEl = document.getElementById('selected-task-prompt');
  const copyBtn = document.querySelector('[data-action="copy-best-prompt"]');
  const blockedList = document.getElementById('blocked-tasks');
  const blockedCount = document.getElementById('blocked-count');
  if (!body) return;
  if (!result) { body.textContent = 'Pas encore chargé.'; return; }
  if (!result.ok || !result.best) {
    body.innerHTML = `<strong style="color: var(--warn);">Aucune task safe</strong><br><span class="muted">${escapeHtml(result.reason ?? 'rien à exécuter')}</span>`;
    if (promptEl) { promptEl.textContent = ''; promptEl.classList.add('hidden'); }
    if (copyBtn) copyBtn.disabled = true;
  } else {
    const best = result.best;
    const run = result.runnability ?? {};
    const runState = run.canExec ? '<span class="badge ok">exec</span>'
      : run.canPlan ? '<span class="badge warn">plan-only</span>'
      : '<span class="badge danger">bloqué</span>';
    const blockers = (run.blockers ?? []).length
      ? `<ul class="small" style="margin: 6px 0 0; padding-left: 20px;">${run.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
      : '';
    body.innerHTML = `
      <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div>
          <strong style="font-size: 16px;">#${best.number} · ${escapeHtml(best.title)}</strong>
          <div class="muted small" style="margin-top: 4px;">Score ${best.score ?? '—'} · classification ${best.classification ?? '—'}</div>
        </div>
        ${runState}
      </div>
      <div class="muted small" style="margin-top: 10px;">${escapeHtml(best.reason)}</div>
      ${blockers}
    `;
    if (copyBtn) copyBtn.disabled = false;
  }
  if (blockedList) {
    blockedList.innerHTML = (result.blocked ?? []).map((b) => `<li>#${b.number} · ${escapeHtml(b.title || '')} — <span class="muted">${escapeHtml(b.reasons?.join(', ') ?? 'safe mais non sélectionnée')}</span></li>`).join('');
    if (blockedCount) blockedCount.textContent = String(result.blocked?.length ?? 0);
  }
}

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
