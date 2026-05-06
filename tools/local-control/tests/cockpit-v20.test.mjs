import { test } from 'node:test';
import { strict as assert } from 'node:assert';

function setupDom() {
  const byId = new Map();
  function el() {
    const node = {
      tagName: 'DIV',
      id: '',
      className: '',
      _innerHTML: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(v) { this._innerHTML = String(v); },
      classList: {
        _set: new Set(),
        add(...cs) { for (const c of cs) this._set.add(c); },
        remove(...cs) { for (const c of cs) this._set.delete(c); },
        contains(c) { return this._set.has(c); },
        toggle(c, v) { if (v == null ? !this._set.has(c) : v) this.add(c); else this.remove(c); },
      },
      dataset: {},
      style: {},
      _children: [],
      appendChild(c) { this._children.push(c); return c; },
    };
    return node;
  }
  function ensure(id) {
    if (!byId.has(id)) { const n = el(); n.id = id; byId.set(id, n); }
    return byId.get(id);
  }
  globalThis.document = {
    getElementById(id) { return byId.has(id) ? byId.get(id) : null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  return { ensure };
}

test('renderActivityTicker idle when no run', async () => {
  const { ensure } = setupDom();
  const host = ensure('activity-ticker');
  const { renderActivityTicker } = await import('../public/lib/mission.js?t=at1');
  renderActivityTicker(null);
  assert.ok(host.classList.contains('idle'));
  assert.match(host.innerHTML, /Cockpit ready/);
});

test('renderActivityTicker live during running unattended run', async () => {
  const { ensure } = setupDom();
  const host = ensure('activity-ticker');
  const { renderActivityTicker } = await import('../public/lib/mission.js?t=at2');
  renderActivityTicker({
    status: 'running', currentStep: 'claude-running', issue: 7,
    unattended: true, plannedTasks: 5,
    completedIssues: [{ number: 1 }], failedIssues: [],
  });
  assert.match(host.innerHTML, /Claude is coding/);
  assert.match(host.innerHTML, /1 done/);
});

test('renderActivityTicker warn during waiting state', async () => {
  const { ensure } = setupDom();
  const host = ensure('activity-ticker');
  const { renderActivityTicker } = await import('../public/lib/mission.js?t=at3');
  renderActivityTicker({
    status: 'waiting', pendingQuestionId: 'q-9-1',
    pendingQuestion: { question: 'Should we ship X?', issue: 9 },
  });
  assert.ok(host.classList.contains('warn'));
  assert.match(host.innerHTML, /Décision humaine/);
  assert.match(host.innerHTML, /q-9-1/);
});

test('renderQuestionCard shows full payload, options, recommendation', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-question');
  const { renderQuestionCard } = await import('../public/lib/mission.js?t=qc1');
  renderQuestionCard({
    status: 'waiting',
    pendingQuestionId: 'q-12-3',
    pendingQuestion: {
      qid: 'q-12-3', issue: 12, blockLevel: 'soft',
      question: 'Foo or bar?', why: 'ambiguous spec.',
      options: ['A) foo', 'B) bar'],
      recommendation: 'B) bar',
      githubUrl: 'http://example/issue/12',
    },
  });
  assert.equal(host.classList.contains('hidden'), false);
  assert.match(host.innerHTML, /Foo or bar/);
  assert.match(host.innerHTML, /ambiguous spec/);
  assert.match(host.innerHTML, /A\) foo/);
  assert.match(host.innerHTML, /B\) bar/);
  assert.match(host.innerHTML, /recommandé/);
  assert.match(host.innerHTML, /q-answer-input/);
  assert.match(host.innerHTML, /Voir sur GitHub/);
});

test('renderQuestionCard hides when not waiting', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-question');
  const { renderQuestionCard } = await import('../public/lib/mission.js?t=qc2');
  renderQuestionCard({ status: 'running' });
  assert.ok(host.classList.contains('hidden'));
});

test('renderRecentRuns lists outcomes and PR links', async () => {
  const { ensure } = setupDom();
  const host = ensure('recent-runs');
  const { renderRecentRuns } = await import('../public/lib/mission.js?t=rr1');
  renderRecentRuns([
    {
      id: 'a', outcome: 'partial', summary: '2 PR · 1 failed',
      completedAt: new Date(Date.now() - 60_000).toISOString(),
      durationMs: 90_000, prsCreated: 2, completedIssues: 2, failedCount: 1,
      firstPr: { number: 100, url: 'http://x/100' },
    },
    {
      id: 'b', outcome: 'completed', summary: 'Mission terminée : 1 PR créée.',
      completedAt: new Date(Date.now() - 300_000).toISOString(),
      durationMs: 300_000, prsCreated: 1, completedIssues: 1, failedCount: 0,
      firstPr: { number: 99, url: 'http://x/99' },
    },
  ]);
  assert.equal(host.classList.contains('hidden'), false);
  assert.match(host.innerHTML, /partial/);
  assert.match(host.innerHTML, /completed/);
  assert.match(host.innerHTML, /PR #100/);
  assert.match(host.innerHTML, /PR #99/);
});

test('renderRecentRuns hides when no items', async () => {
  const { ensure } = setupDom();
  const host = ensure('recent-runs');
  const { renderRecentRuns } = await import('../public/lib/mission.js?t=rr2');
  renderRecentRuns([]);
  assert.ok(host.classList.contains('hidden'));
});

test('PR state helpers map correctly', async () => {
  const { prStateClass, prStateLabel } = await import('../public/lib/mission.js?t=ps1');
  assert.equal(prStateClass({ state: 'merged' }), 'merged');
  assert.equal(prStateLabel({ state: 'merged' }), 'merged');
  assert.equal(prStateClass({ state: 'open' }), 'open');
  assert.equal(prStateClass({ state: 'open', isDraft: true }), 'draft');
  assert.equal(prStateClass({ state: 'closed' }), 'closed');
  assert.equal(prStateClass({}), 'unknown');
  assert.equal(prStateLabel({}), '—');
});

test('renderMissionResult includes Refresh PR status when PRs exist', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-result');
  const { renderMissionResult } = await import('../public/lib/mission.js?t=mr-r1');
  renderMissionResult({
    status: 'completed', issue: 1, completedAt: new Date().toISOString(),
    prsCreated: 1, prUrl: 'http://x/1', prNumber: 1,
    createdPrs: [{ number: 1, url: 'http://x/1', title: 'a', state: 'open' }],
    failedIssues: [], skippedIssues: [],
    missionReport: {
      outcome: 'completed', summary: 'OK', nextAction: 'Review',
      createdPrs: [{ number: 1, url: 'http://x/1', title: 'a', state: 'open' }],
      failedIssues: [], skippedIssues: [], prsCreated: 1,
    },
  });
  assert.match(host.innerHTML, /Refresh PR status/);
  assert.match(host.innerHTML, /pr-state open/);
});

test('renderQuestionCard stale mode shows fallback button + Reset', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-question');
  const { renderQuestionCard } = await import('../public/lib/mission.js?t=qc-stale');
  renderQuestionCard({
    status: 'waiting',
    pendingQuestionId: 'q-12-old',
    pendingQuestion: { qid: 'q-12-old', issue: 12, question: 'OK?', options: [], recommendation: null },
  }, { isLive: false });
  assert.match(host.innerHTML, /Envoyer la réponse \(run précédent\)/);
  assert.match(host.innerHTML, /Reset run/);
});
