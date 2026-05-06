// Cockpit V5 — central rendering helpers (Mission Control redesign).
// Pure DOM, no fetch. Driven by app.js with backend payloads.

export function renderTopbar({ conn, settings }) {
  const orb = document.getElementById('conn-orb');
  if (orb) {
    orb.classList.remove('ok', 'err', 'warn', 'running');
    if (conn === 'connected') orb.classList.add('ok');
    else if (conn === 'auth-required' || conn === 'offline') orb.classList.add('err');
  }
  const badge = document.getElementById('conn-badge');
  if (badge) {
    badge.textContent =
      conn === 'connected' ? 'connected' :
      conn === 'auth-required' ? 'auth' :
      conn === 'offline' ? 'offline' : '…';
    badge.classList.remove('ok', 'err', 'warn');
    if (conn === 'connected') badge.classList.add('ok');
    else if (conn === 'auth-required' || conn === 'offline') badge.classList.add('err');
  }
  const mode = document.getElementById('mode-badge');
  if (mode && settings) {
    if (!settings.allowExec) { mode.textContent = 'PROMPT-ONLY'; mode.className = 'badge info'; }
    else if (!settings.allowLoop) { mode.textContent = 'RUN-ONE'; mode.className = 'badge running'; }
    else { mode.textContent = `LOOP ${settings.maxPrsPerRun ?? 5}`; mode.className = 'badge running'; }
  }
}

export function renderStatusGrid({ conn, settings, v5, network }) {
  const map = {
    claude: claudePill(v5),
    branch: branchPill(),
    exec: pill(settings?.allowExec ? 'warn' : 'ok', settings?.allowExec ? 'autorisé' : 'OFF'),
    loop: pill(settings?.allowLoop ? 'warn' : 'ok', settings?.allowLoop ? 'autorisé' : 'OFF'),
    automerge: pill(settings?.allowAutoMerge ? 'warn' : 'info', settings?.allowAutoMerge ? 'POWER ON' : 'off'),
    notion: pillForNotion(v5?.notion),
    n8n: pillForN8n(v5?.n8n),
    whatsapp: pillForWhatsapp(v5?.whatsapp),
    lan: pill(network?.lan ? 'ok' : 'info', network?.lan ? (network.lanIp ?? 'on') : 'local'),
  };
  const grid = document.getElementById('status-grid');
  if (!grid) return;
  for (const li of grid.querySelectorAll('[data-key]')) {
    const k = li.dataset.key;
    const m = map[k];
    if (!m) continue;
    li.classList.remove('ok', 'warn', 'err', 'info');
    li.classList.add(m.cls);
    const v = li.querySelector('[data-value]');
    if (v) v.textContent = m.text;
    const orb = li.querySelector('.orb');
    if (orb) {
      orb.classList.remove('ok', 'warn', 'err', 'running');
      if (m.cls === 'ok') orb.classList.add('ok');
      else if (m.cls === 'warn') orb.classList.add('warn');
      else if (m.cls === 'err') orb.classList.add('err');
    }
  }
}

function pill(cls, text) { return { cls, text }; }
function claudePill(v5) {
  if (!v5) return pill('info', '…');
  return v5.claudeAvailable ? pill('ok', v5.claudeVersion ? v5.claudeVersion.split(' ')[0] : 'available') : pill('err', 'indispo');
}
function branchPill() {
  // Branch comes from /api/dashboard but we keep simple here — set by caller via renderStatusBranch
  return pill('info', '…');
}
function pillForNotion(n) {
  if (!n || n.stage === 'unknown') return pill('info', '…');
  if (n.stage === 'configured') return pill('ok', 'ready');
  if (n.stage === 'missing-token') return pill('warn', 'missing token');
  if (n.stage === 'missing-database-id') return pill('warn', 'missing DB id');
  return pill('info', 'optional');
}
function pillForN8n(n) {
  if (!n || n.stage === 'unknown') return pill('info', '…');
  if (n.stage === 'configured') return pill('ok', 'ready');
  if (n.stage === 'partial-webhooks') return pill('warn', 'partial');
  if (n.stage === 'base-only') return pill('info', 'base ok');
  if (n.stage === 'missing-secret') return pill('warn', 'missing secret');
  return pill('info', 'optional');
}
function pillForWhatsapp(w) {
  if (!w) return pill('info', '…');
  if (w.configured) return pill('ok', w.via || 'on');
  return pill('info', 'optional');
}

export function renderStatusBranch(dashboard) {
  const li = document.querySelector('#status-grid [data-key="branch"]');
  if (!li || !dashboard) return;
  const v = li.querySelector('[data-value]');
  if (v) v.textContent = dashboard.branch ?? '—';
  li.classList.remove('ok', 'warn', 'err', 'info');
  li.classList.add(dashboard.branch === 'main' ? 'ok' : 'warn');
  const orb = li.querySelector('.orb');
  if (orb) { orb.classList.remove('ok', 'warn', 'err', 'running'); orb.classList.add(dashboard.branch === 'main' ? 'ok' : 'warn'); }
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
      return `<li class="status-pill ${cls}"><span class="orb ${cls === 'ok' ? 'ok' : cls === 'warn' ? 'warn' : cls === 'err' ? 'err' : ''}"></span><span class="label">${escapeHtml(c.label)}</span><span class="value">${escapeHtml(c.detail ?? '—')}</span></li>`;
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
}

export function renderPhone(network) {
  const local = document.getElementById('phone-local');
  const lan = document.getElementById('phone-lan');
  if (local) local.textContent = network?.localUrl ?? `http://127.0.0.1:${network?.port ?? 8787}`;
  if (lan) lan.textContent = network?.lanUrl ?? '—';
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

export function renderIntegrationSettings(v5) {
  if (!v5) return;
  const set = (id, badge, detail) => {
    const b = document.getElementById(id + '-badge');
    const d = document.getElementById(id + '-detail');
    if (b) { b.textContent = badge.text; b.className = 'badge ' + badge.cls; }
    if (d) d.textContent = detail || '';
  };
  const n = v5.notion ?? {};
  const cl = n.stage === 'configured' ? { cls: 'ok', text: 'ready' } : n.stage === 'missing-token' ? { cls: 'warn', text: 'missing token' } : n.stage === 'missing-database-id' ? { cls: 'warn', text: 'missing DB id' } : { cls: 'info', text: 'optional' };
  set('settings-notion', cl, n.summary);

  const w = v5.n8n ?? {};
  const wcl = w.stage === 'configured' ? { cls: 'ok', text: 'ready' } : w.stage === 'partial-webhooks' ? { cls: 'warn', text: 'partial' } : w.stage === 'base-only' ? { cls: 'info', text: 'base ok' } : w.stage === 'missing-secret' ? { cls: 'warn', text: 'missing secret' } : { cls: 'info', text: 'optional' };
  set('settings-n8n', wcl, w.summary);

  const wa = v5.whatsapp ?? {};
  const wacl = wa.configured ? { cls: 'ok', text: wa.via || 'on' } : { cls: 'info', text: 'optional' };
  set('settings-whatsapp', wacl, wa.configured ? `via ${wa.via ?? 'on'}` : 'mobile notifications');
}

export function mountSettingsNav() {
  const nav = document.getElementById('settings-nav');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]');
    if (!btn) return;
    e.preventDefault();
    for (const b of nav.querySelectorAll('button')) b.classList.toggle('active', b === btn);
    for (const sec of document.querySelectorAll('.settings-section')) sec.classList.toggle('active', sec.dataset.section === btn.dataset.section);
  });
}

export function openSettingsSection(section) {
  document.querySelector('[data-tab="settings"]')?.click();
  const nav = document.getElementById('settings-nav');
  if (!nav) return;
  for (const b of nav.querySelectorAll('button')) b.classList.toggle('active', b.dataset.section === section);
  for (const sec of document.querySelectorAll('.settings-section')) sec.classList.toggle('active', sec.dataset.section === section);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
