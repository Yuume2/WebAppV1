import { test } from 'node:test';
import { strict as assert } from 'node:assert';

function setupDom() {
  const byId = new Map();
  function el(tag = 'div') {
    const node = {
      tagName: tag.toUpperCase(),
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
      style: {},
      _children: [],
      appendChild(c) { this._children.push(c); return c; },
    };
    return node;
  }
  function ensure(id) {
    if (!byId.has(id)) {
      const n = el();
      n.id = id;
      byId.set(id, n);
    }
    return byId.get(id);
  }
  globalThis.document = {
    getElementById(id) { return byId.has(id) ? byId.get(id) : null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  return { ensure };
}

test('renderMissionResult renders multi-PR list and Copy PR links button', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-result');
  const { renderMissionResult } = await import('../public/lib/mission.js?t=mr1');
  const ap = {
    status: 'completed',
    issue: 10,
    issueTitle: 'demo',
    completedAt: new Date().toISOString(),
    prsCreated: 2,
    prUrl: 'http://x/100',
    prNumber: 100,
    createdPrs: [
      { number: 100, url: 'http://x/100', title: 'PR a' },
      { number: 101, url: 'http://x/101', title: 'PR b' },
    ],
    failedIssues: [{ number: 12, reason: 'claude-failed', detail: 'exit=1' }],
    skippedIssues: [],
    missionReport: {
      outcome: 'partial',
      summary: 'Mission terminée : 2 PR créées, 1 issue échouée.',
      nextAction: 'Review and merge 2 PRs manually.',
      createdPrs: [
        { number: 100, url: 'http://x/100', title: 'PR a' },
        { number: 101, url: 'http://x/101', title: 'PR b' },
      ],
      failedIssues: [{ number: 12, reason: 'claude-failed', detail: 'exit=1' }],
      skippedIssues: [],
      prsCreated: 2,
    },
  };
  renderMissionResult(ap);
  assert.match(host.innerHTML, /PRs created \(2\)/);
  assert.match(host.innerHTML, /PR #100/);
  assert.match(host.innerHTML, /PR #101/);
  assert.match(host.innerHTML, /Failed \(1\)/);
  assert.match(host.innerHTML, /#12/);
  assert.match(host.innerHTML, /Copy PR links/);
  assert.match(host.innerHTML, /Open all PRs/);
  assert.match(host.innerHTML, /Review and merge/);
});

test('renderMissionResult on failed all yields Retry button', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-result');
  const { renderMissionResult } = await import('../public/lib/mission.js?t=mr2');
  const ap = {
    status: 'failed',
    issue: 42,
    completedAt: new Date().toISOString(),
    createdPrs: [],
    failedIssues: [{ number: 42, reason: 'claude-failed', detail: 'exit=1' }],
    skippedIssues: [],
    missionReport: {
      outcome: 'failed',
      summary: 'Aucune PR créée : #42 a échoué (claude-failed).',
      nextAction: 'Inspect 1 failed issue and retry manually.',
      createdPrs: [],
      failedIssues: [{ number: 42, reason: 'claude-failed', detail: 'exit=1' }],
      skippedIssues: [],
      prsCreated: 0,
    },
  };
  renderMissionResult(ap);
  assert.match(host.innerHTML, /Aucune PR/);
  assert.match(host.innerHTML, /Retry failed/);
});

test('renderUnattendedRun shows live counts and Copy PR links during running', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-unattended');
  const { renderUnattendedRun } = await import('../public/lib/mission.js?t=mu1');
  const ap = {
    status: 'running',
    unattended: true,
    plannedTasks: 5,
    issue: 7,
    issueTitle: 'live',
    completedIssues: [{ number: 5 }],
    failedIssues: [{ number: 6, reason: 'x' }],
    skippedIssues: [],
    createdPrs: [{ number: 10, url: 'http://x/10', title: 'live PR' }],
  };
  renderUnattendedRun(ap);
  assert.match(host.innerHTML, /Unattended run/);
  assert.match(host.innerHTML, /Planned: 5/);
  assert.match(host.innerHTML, /Current: #7/);
  assert.match(host.innerHTML, /1<\/strong> done/);
  assert.match(host.innerHTML, /1<\/strong> failed/);
  assert.match(host.innerHTML, /PR #10/);
  assert.match(host.innerHTML, /Copy PR links/);
});

test('renderUnattendedRun hides when not unattended', async () => {
  const { ensure } = setupDom();
  const host = ensure('mission-unattended');
  const { renderUnattendedRun } = await import('../public/lib/mission.js?t=mu2');
  const ap = { status: 'running', unattended: false };
  renderUnattendedRun(ap);
  assert.ok(host.classList.contains('hidden'));
});

test('buildPrLinksText returns newline-joined links', async () => {
  const { buildPrLinksText } = await import('../public/lib/mission.js?t=mu3');
  const ap = {
    createdPrs: [
      { url: 'http://x/1', title: 'a' },
      { url: 'http://x/2', title: 'b' },
    ],
  };
  const t = buildPrLinksText(ap);
  assert.match(t, /http:\/\/x\/1/);
  assert.match(t, /http:\/\/x\/2/);
  assert.equal(t.split('\n').length, 2);
});
