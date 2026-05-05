// Mission Control — pure rendering helpers for the new IA.

export const MISSION_MODES = Object.freeze([
  { id: 'manual', name: 'Manual prompt', desc: 'Prépare un prompt à coller dans yu.', mode: 'plan', maxPrs: 1, loop: false, requiresExec: false },
  { id: 'auto1', name: 'Auto · 1 task', desc: 'Une PR puis stop.', mode: 'exec', maxPrs: 1, loop: false, requiresExec: true },
  { id: 'auto5', name: 'Auto · 5 tasks', desc: 'Loop jusqu\'à 5 PR. Défaut.', mode: 'loop', maxPrs: 5, loop: true, requiresExec: true, requiresLoop: true },
  { id: 'loop10', name: 'Loop · 10 tasks', desc: 'Loop intensif jusqu\'à 10 PR.', mode: 'loop', maxPrs: 10, loop: true, requiresExec: true, requiresLoop: true },
  { id: 'loop20', name: 'Loop · 20 tasks', desc: 'Loop max jusqu\'à 20 PR.', mode: 'loop', maxPrs: 20, loop: true, requiresExec: true, requiresLoop: true },
  { id: 'custom', name: 'Custom loop', desc: 'Choisis ton budget.', mode: 'loop', maxPrs: 5, loop: true, requiresExec: true, requiresLoop: true, custom: true },
  { id: 'full', name: 'Full autopilot', desc: 'Vérifie toute la checklist avant de lancer.', mode: 'loop', maxPrs: 5, loop: true, requiresExec: true, requiresLoop: true, full: true },
]);

export const DEFAULT_MODE_ID = 'auto5';

const STEP_ORDER = ['preflight', 'select', 'branch', 'claude', 'tests', 'guard', 'pr', 'done'];
const STEP_PERCENT = { preflight: 5, select: 12, branch: 22, claude: 50, tests: 70, guard: 85, pr: 95, done: 100 };

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderModeRail(activeId, onSelect) {
  const rail = document.getElementById('mode-rail');
  if (!rail) return;
  rail.innerHTML = MISSION_MODES.map((m) => `
    <button type="button" role="radio" class="mode-card${m.id === activeId ? ' active' : ''}${m.full ? ' danger' : ''}" data-mode="${m.id}" aria-checked="${m.id === activeId}">
      <span class="mode-name">${escapeHtml(m.name)}</span>
      <span class="mode-desc">${escapeHtml(m.desc)}</span>
    </button>
  `).join('');
  for (const btn of rail.querySelectorAll('[data-mode]')) {
    btn.addEventListener('click', () => onSelect && onSelect(btn.dataset.mode));
  }
  const customBox = document.getElementById('mode-custom-input');
  if (customBox) customBox.classList.toggle('show', activeId === 'custom');
}

export function findMode(id) { return MISSION_MODES.find((m) => m.id === id) ?? MISSION_MODES.find((m) => m.id === DEFAULT_MODE_ID); }

export function buildMissionState({ mode, settings, v5, ap, fullReadiness, customMax }) {
  const m = findMode(mode);
  const apStatus = ap?.status ?? 'idle';

  const claudeOk = !!v5?.claudeAvailable;
  const execOk = !!settings?.allowExec;
  const loopOk = !!settings?.allowLoop;

  const blockers = [];
  if (m.requiresExec && !execOk) blockers.push({ kind: 'warn', text: 'Exec disabled — flippe Settings → Safety → Autoriser exec.' });
  if (m.requiresLoop && !loopOk) blockers.push({ kind: 'warn', text: 'Loop disabled — flippe Settings → Safety → Autoriser loop.' });
  if (m.requiresExec && !claudeOk) blockers.push({ kind: 'danger', text: `Claude CLI indispo : ${v5?.claudeReason ?? 'check CLAUDE_CODE_COMMAND'}` });
  if (m.full && fullReadiness && !fullReadiness.ready) blockers.push({ kind: 'warn', text: fullReadiness.summary });

  let title = 'Claude Autopilot';
  let subtitle = 'Préparation de la mission…';
  let ctaLabel = 'Start mission';
  let ctaDisabled = false;
  let orbClass = 'ok';
  let eyebrow = 'Ready';

  if (apStatus === 'running') {
    title = ap?.issue ? `Claude is working on #${ap.issue}` : 'Claude is working';
    subtitle = ap?.currentStep ? `Étape : ${ap.currentStep.replace(/-/g, ' ')}` : 'En cours…';
    ctaLabel = 'En cours…';
    ctaDisabled = true;
    orbClass = 'running';
    eyebrow = 'Mission en cours';
  } else if (apStatus === 'waiting') {
    title = 'Décision humaine requise';
    subtitle = ap?.pendingQuestionId ? `Question : ${ap.pendingQuestionId}` : 'Réponds dans GitHub puis Resume.';
    ctaLabel = 'Resume';
    orbClass = 'warn';
    eyebrow = 'En attente';
  } else if (apStatus === 'completed') {
    const prs = ap?.prsCreated ?? 0;
    title = prs ? `Mission terminée · ${prs} PR créée${prs > 1 ? 's' : ''}` : 'Mission terminée';
    subtitle = ap?.lastPR ? `Dernière PR : ${ap.lastPR.url ?? `#${ap.lastPR.number}`}` : 'Tu peux relancer une nouvelle mission.';
    ctaLabel = ap?.lastPR ? 'Review PR' : 'Start mission';
    orbClass = 'ok';
    eyebrow = 'Mission complète';
  } else if (apStatus === 'stopped') {
    title = 'Mission stoppée';
    subtitle = ap?.stopReason ? `Raison : ${ap.stopReason}` : 'Stoppée manuellement.';
    ctaLabel = 'Start mission';
    orbClass = 'warn';
    eyebrow = 'Stoppé';
  } else {
    // idle / unknown
    if (blockers.length) {
      title = `${blockers.length} item${blockers.length > 1 ? 's' : ''} avant Full autopilot`;
      subtitle = m.full ? 'Coche les items requis ci-dessous ou choisis un mode plus simple.' : blockers[0].text;
      ctaLabel = blockers.some((b) => b.kind === 'danger') ? 'Configure missing items' : 'Start mission';
      orbClass = 'warn';
      eyebrow = 'Configuration requise';
    } else {
      const max = m.custom ? (Number(customMax) || 5) : m.maxPrs;
      if (m.id === 'manual') {
        title = 'Manual prompt';
        subtitle = 'Génère un prompt à coller dans yu. Aucune action réelle.';
        ctaLabel = 'Generate prompt';
      } else if (m.maxPrs === 1) {
        title = `Ready to run 1 safe task.`;
        subtitle = 'Une PR puis stop.';
      } else {
        title = `Ready to run ${max} safe tasks.`;
        subtitle = m.loop ? `Loop jusqu'à ${max} PR ou budget atteint.` : `${max} PR puis stop.`;
      }
    }
  }

  return {
    mode: m,
    title, subtitle, ctaLabel, ctaDisabled, orbClass, eyebrow,
    blockers,
  };
}

export function renderMissionHero(state) {
  setText('mission-eyebrow', state.eyebrow);
  setText('mission-title', state.title);
  setText('mission-subtitle', state.subtitle);
  const cta = document.getElementById('mission-cta');
  if (cta) {
    cta.textContent = state.ctaLabel;
    cta.disabled = !!state.ctaDisabled;
  }
  const orbs = ['mission-orb'];
  for (const id of orbs) {
    const o = document.getElementById(id);
    if (!o) continue;
    o.classList.remove('ok', 'running', 'warn', 'err');
    o.classList.add(state.orbClass);
  }
  const banner = document.getElementById('mission-blocker');
  if (banner) {
    if (state.blockers.length) {
      banner.classList.remove('hidden');
      banner.classList.toggle('danger', state.blockers.some((b) => b.kind === 'danger'));
      banner.classList.toggle('info', state.blockers.every((b) => b.kind === 'info'));
      const list = document.getElementById('mission-blocker-list');
      if (list) list.innerHTML = state.blockers.map((b) => `<li>${escapeHtml(b.text)}</li>`).join('');
    } else {
      banner.classList.add('hidden');
    }
  }
}

export function renderMissionProgress(ap) {
  const wrap = document.getElementById('mission-progress');
  if (!wrap) return;
  if (!ap || (ap.status !== 'running' && ap.status !== 'waiting')) {
    wrap.classList.add('hidden-step');
    return;
  }
  wrap.classList.remove('hidden-step');
  const step = mapStep(ap.currentStep);
  const pct = ap.status === 'completed' ? 100 : (STEP_PERCENT[step] ?? 5);
  setText('progress-percent', `${pct}%`);
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = `${pct}%`;
  setText('progress-status-text', humanStep(step, ap));
  for (const li of document.querySelectorAll('.timeline-step')) {
    li.classList.remove('done', 'active', 'failed');
    const s = li.dataset.step;
    const idx = ['select', 'branch', 'claude', 'tests', 'guard', 'pr', 'done'].indexOf(s);
    const cur = ['select', 'branch', 'claude', 'tests', 'guard', 'pr', 'done'].indexOf(step);
    if (cur < 0) continue;
    if (idx < cur) li.classList.add('done');
    else if (idx === cur) li.classList.add(ap.status === 'stopped' ? 'failed' : 'active');
  }
  const orb = document.getElementById('progress-orb');
  if (orb) {
    orb.classList.remove('ok', 'running', 'warn', 'err');
    orb.classList.add(ap.status === 'waiting' ? 'warn' : 'running');
  }
}

function mapStep(currentStep) {
  if (!currentStep) return 'select';
  if (currentStep.startsWith('preflight') || currentStep === 'preflight') return 'select';
  if (currentStep === 'task-selected' || currentStep === 'reset-to-main') return 'select';
  if (currentStep === 'create-branch') return 'branch';
  if (currentStep === 'launching-claude' || currentStep === 'claude-exited' || currentStep === 'prompt-ready') return 'claude';
  if (currentStep === 'task-guard') return 'guard';
  if (currentStep === 'check-pr' || currentStep === 'pr-created' || currentStep === 'no-pr-no-question') return 'pr';
  return 'select';
}

function humanStep(step, ap) {
  switch (step) {
    case 'select': return ap.status === 'waiting' ? 'Décision humaine requise.' : 'Sélection de la task safe…';
    case 'branch': return 'Création de la branche dédiée…';
    case 'claude': return 'Claude is coding…';
    case 'tests': return 'Tests are running…';
    case 'guard': return 'Task guard…';
    case 'pr': return ap.lastPR ? 'PR ouverte.' : 'Vérification PR…';
    case 'done': return 'Done.';
    default: return 'En cours…';
  }
}

export function renderFullChecklist(readiness, onAction) {
  const card = document.getElementById('full-checklist-card');
  const list = document.getElementById('full-checklist');
  const summary = document.getElementById('full-checklist-summary');
  if (!card || !list || !readiness) { if (card) card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  if (summary) summary.textContent = readiness.summary;
  list.innerHTML = readiness.items.map((it) => {
    const cls = it.status === 'ready' ? 'ready' : it.status === 'optional' ? 'optional' : it.status === 'blocked' ? 'blocked' : 'missing';
    const action = it.action ? `<button type="button" data-checklist-action="${escapeHtml(it.action)}">Configure</button>` : '';
    return `<li class="checklist-item ${cls}">
      <span class="check-icon" aria-hidden="true"></span>
      <span class="check-body">
        <span class="check-label">${escapeHtml(it.label)}</span>
        <span class="check-detail">${escapeHtml(it.detail || '')}</span>
      </span>
      ${action}
    </li>`;
  }).join('');
  for (const btn of list.querySelectorAll('[data-checklist-action]')) {
    btn.addEventListener('click', () => onAction && onAction(btn.dataset.checklistAction));
  }
}

export function renderNextTask(result) {
  const host = document.getElementById('next-task-host');
  if (!host) return;
  if (!result || !result.ok || !result.best) {
    host.innerHTML = `<div class="card muted small">${escapeHtml(result?.reason ?? 'Aucune task safe.')}</div>`;
    return;
  }
  const t = result.best;
  const run = result.runnability ?? {};
  const runState = run.canExec ? '<span class="task-tag safe">exec ok</span>' : run.canPlan ? '<span class="task-tag risk">plan-only</span>' : '<span class="task-tag blocked">bloqué</span>';
  host.innerHTML = `
    <div class="task-card next">
      <div class="task-card-head">
        <span class="task-num">#${t.number}</span>
        <span class="task-score">score ${t.score ?? '—'}</span>
      </div>
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="task-meta">
        ${runState}
        ${t.classification ? `<span class="task-tag">${escapeHtml(t.classification)}</span>` : ''}
      </div>
      <div class="task-reason">${escapeHtml(t.reason || '')}</div>
      <div class="task-actions">
        <button type="button" data-best-action="prepare" class="primary" data-needs="auth">Prepare</button>
        <button type="button" data-best-action="copy" data-needs="auth" disabled>Copy prompt</button>
        ${t.url ? `<button type="button" data-best-action="open" data-needs="auth">View issue</button>` : ''}
      </div>
    </div>
  `;
}

export function renderTaskBoard(result) {
  const host = document.getElementById('task-board-host');
  if (!host) return;
  const items = [];
  if (result?.ok && result.best) items.push({ ...result.best, _next: true });
  for (const b of (result?.blocked ?? [])) items.push({ number: b.number, title: b.title, score: b.score, classification: b.classification, _blocked: true, reasons: b.reasons });
  if (!items.length) {
    host.innerHTML = `<div class="card muted small">Pas de tasks.</div>`;
    return;
  }
  host.innerHTML = items.map((t) => {
    const cls = t._next ? 'next' : t._blocked ? 'blocked' : '';
    const tag = t._next ? '<span class="task-tag safe">next</span>' : t._blocked ? '<span class="task-tag blocked">bloquée</span>' : '<span class="task-tag">queue</span>';
    const reason = t.reasons?.length ? t.reasons.join(', ') : (t.reason || '—');
    return `<div class="task-card ${cls}">
      <div class="task-card-head">
        <span class="task-num">#${t.number}</span>
        <span class="task-score">${t.score != null ? 'score ' + t.score : ''}</span>
      </div>
      <div class="task-title">${escapeHtml(t.title || '')}</div>
      <div class="task-meta">${tag}${t.classification ? `<span class="task-tag">${escapeHtml(t.classification)}</span>` : ''}</div>
      <div class="task-reason">${escapeHtml(reason)}</div>
    </div>`;
  }).join('');
}

export function renderLogSummary({ last, success, error }) {
  const set = (key, val) => {
    const row = document.querySelector(`#log-summary [data-key="${key}"]`);
    if (!row) return;
    row.parentElement?.classList.toggle('empty', !val);
    row.textContent = val || '—';
  };
  set('last', last);
  set('success', success);
  set('error', error);
}

export function appendLogLine(text, kind = '') {
  const view = document.getElementById('log-view');
  if (!view) return;
  const span = document.createElement('span');
  span.className = 'log-line' + (kind ? ' ' + kind : '');
  span.textContent = text;
  view.appendChild(span);
  if (document.getElementById('log-autoscroll')?.checked) view.scrollTop = view.scrollHeight;
  const counter = document.getElementById('log-drawer-count');
  if (counter) counter.textContent = `${view.children.length} lignes`;
}

export function clearLogs() {
  const view = document.getElementById('log-view');
  if (view) view.innerHTML = '';
  const counter = document.getElementById('log-drawer-count');
  if (counter) counter.textContent = '0 lignes';
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val ?? ''; }
