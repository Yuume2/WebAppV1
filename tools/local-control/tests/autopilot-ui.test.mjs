import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// minimal DOM stub so renderAutopilotState runs in a node environment
function makeCard() {
  const map = new Map();
  function el(id, opts = {}) {
    const node = {
      id,
      textContent: '',
      classList: { _set: new Set(), add(c) { this._set.add(c); }, remove(...cs) { for (const c of cs) this._set.delete(c); }, contains(c) { return this._set.has(c); }, toggle(c, v) { v ? this.add(c) : this.remove(c); } },
      dataset: opts.dataset ?? {},
      _children: [],
      querySelector(sel) { return findInTree(this, sel); },
      querySelectorAll(sel) { const out = []; collectInTree(this, sel, out); return out; },
      appendChild(c) { this._children.push(c); return c; },
    };
    map.set(id, node);
    return node;
  }
  function findInTree(root, sel) {
    if (matches(root, sel)) return root;
    for (const c of root._children) { const r = findInTree(c, sel); if (r) return r; }
    return null;
  }
  function collectInTree(root, sel, out) {
    if (matches(root, sel)) out.push(root);
    for (const c of root._children) collectInTree(c, sel, out);
  }
  function matches(node, sel) {
    if (sel.startsWith('#')) return node.id === sel.slice(1);
    if (sel.startsWith('[data-key="')) {
      const v = sel.slice(11, -2);
      return node.dataset?.key === v;
    }
    return false;
  }
  const card = el('autopilot-card');
  card.appendChild(el('autopilot-status-badge'));
  const stats = el('autopilot-stats');
  for (const k of ['mode', 'issue', 'prs', 'errors', 'next', 'automerge']) {
    stats.appendChild(el(`stat-${k}`, { dataset: { key: k } }));
  }
  card.appendChild(stats);
  card.appendChild(el('autopilot-prompt'));
  return card;
}

test('renderAutopilotState handles null state without crashing', async () => {
  const { renderAutopilotState } = await import('../public/lib/autopilot.js');
  const card = makeCard();
  renderAutopilotState(card, null, null);
  const badge = card.querySelector('#autopilot-status-badge');
  assert.equal(badge.textContent, 'idle');
});

test('renderAutopilotState reflects running state and v5 automerge', async () => {
  const { renderAutopilotState } = await import('../public/lib/autopilot.js');
  const card = makeCard();
  renderAutopilotState(card, { status: 'running', mode: 'plan', issue: 42, prsCreated: 1, errors: 0, nextAction: 'continue', lastPrompt: 'do X' }, { autoMergeMode: 'OFF' });
  assert.equal(card.querySelector('#autopilot-status-badge').textContent, 'running');
  assert.equal(card.querySelector('[data-key="issue"]').textContent, '42');
  assert.equal(card.querySelector('[data-key="prs"]').textContent, '1');
  assert.equal(card.querySelector('[data-key="automerge"]').textContent, 'OFF');
  assert.equal(card.querySelector('#autopilot-prompt').textContent, 'do X');
});

test('renderAutopilotState waiting status flagged warn', async () => {
  const { renderAutopilotState } = await import('../public/lib/autopilot.js');
  const card = makeCard();
  renderAutopilotState(card, { status: 'waiting', mode: 'exec', issue: 10, prsCreated: 0, errors: 0, nextAction: 'answer q-1' }, null);
  const badge = card.querySelector('#autopilot-status-badge');
  assert.ok(badge.classList.contains('warn'));
});
