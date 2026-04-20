'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { AppState, AIProvider } from '@webapp/types';
import {
  fetchState, createProject, createWorkspace,
  createChatWindow, createMessage, devSeed,
} from '@/lib/api';

const PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'perplexity'];
const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  perplexity: 'sonar',
};

// ── helpers ─────────────────────────────────────────────────────────────────

function insertSorted<T extends { createdAt: string; id: string }>(arr: T[], item: T): T[] {
  const result = [...arr, item];
  result.sort((a, b) => {
    const d = a.createdAt.localeCompare(b.createdAt);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  return result;
}

function buildParams(params: Record<string, string | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) { if (v) p.set(k, v); }
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}

// ── main component ───────────────────────────────────────────────────────────

function WorkspaceApp() {
  const router = useRouter();
  const sp = useSearchParams();

  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(sp.get('projectId'));
  const [workspaceId, setWorkspaceId] = useState<string | null>(sp.get('workspaceId'));
  const [chatWindowId, setChatWindowId] = useState<string | null>(sp.get('chatWindowId'));

  const [newProjectName, setNewProjectName] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newCwTitle, setNewCwTitle] = useState('');
  const [newCwProvider, setNewCwProvider] = useState<AIProvider>('openai');
  const [newCwModel, setNewCwModel] = useState(DEFAULT_MODEL.openai);
  const [newMessage, setNewMessage] = useState('');

  const threadRef = useRef<HTMLDivElement>(null);

  // selection helpers — update React state + URL atomically
  function selectProject(id: string | null) {
    setProjectId(id); setWorkspaceId(null); setChatWindowId(null);
    router.replace(buildParams({ projectId: id }), { scroll: false });
  }
  function selectWorkspace(id: string | null, pid = projectId) {
    setWorkspaceId(id); setChatWindowId(null);
    router.replace(buildParams({ projectId: pid, workspaceId: id }), { scroll: false });
  }
  function selectChatWindow(id: string | null) {
    setChatWindowId(id);
    router.replace(buildParams({ projectId, workspaceId, chatWindowId: id }), { scroll: false });
  }

  const reload = useCallback(async () => {
    try {
      const s = await fetchState();
      setState(s); setError(null); return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load'); return null;
    }
  }, []);

  const validated = useRef(false);
  useEffect(() => {
    reload().then(s => {
      setLoading(false);
      if (!s || validated.current) return;
      validated.current = true;
      const pid = sp.get('projectId'), wid = sp.get('workspaceId'), cwid = sp.get('chatWindowId');
      if (pid && !s.projects.some(p => p.id === pid)) {
        setProjectId(null); setWorkspaceId(null); setChatWindowId(null);
        router.replace('/', { scroll: false });
      } else if (wid && !s.workspaces.some(ws => ws.id === wid)) {
        setWorkspaceId(null); setChatWindowId(null);
        router.replace(buildParams({ projectId: pid }), { scroll: false });
      } else if (cwid && !s.chatWindows.some(cw => cw.id === cwid)) {
        setChatWindowId(null);
        router.replace(buildParams({ projectId: pid, workspaceId: wid }), { scroll: false });
      }
    });
  }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // scroll thread to bottom on new messages
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [state, chatWindowId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    run(async () => {
      const p = await createProject({ name: newProjectName.trim() });
      setState(s => s ? { ...s, projects: insertSorted(s.projects, p) } : s);
      setNewProjectName('');
      selectProject(p.id);
    });
  };
  const handleCreateWorkspace = () => {
    if (!projectId || !newWorkspaceName.trim()) return;
    run(async () => {
      const ws = await createWorkspace({ projectId, name: newWorkspaceName.trim() });
      setState(s => s ? { ...s, workspaces: insertSorted(s.workspaces, ws) } : s);
      setNewWorkspaceName('');
      selectWorkspace(ws.id);
    });
  };
  const handleCreateChatWindow = () => {
    if (!workspaceId || !newCwTitle.trim() || !newCwModel.trim()) return;
    run(async () => {
      const cw = await createChatWindow({ workspaceId, title: newCwTitle.trim(), provider: newCwProvider, model: newCwModel.trim() });
      setState(s => s ? { ...s, chatWindows: insertSorted(s.chatWindows, cw) } : s);
      setNewCwTitle('');
      selectChatWindow(cw.id);
    });
  };
  const handleSendMessage = () => {
    if (!chatWindowId || !newMessage.trim()) return;
    run(async () => {
      const m = await createMessage({ chatWindowId, role: 'user', content: newMessage.trim() });
      setState(s => s ? { ...s, messages: insertSorted(s.messages, m) } : s);
      setNewMessage('');
    });
  };
  const handleSeed = () => {
    run(async () => {
      await devSeed(); await reload();
      setProjectId(null); setWorkspaceId(null); setChatWindowId(null);
      router.replace('/', { scroll: false });
    });
  };

  // derived data
  const projects    = state?.projects ?? [];
  const workspaces  = state?.workspaces.filter(ws => ws.projectId === projectId) ?? [];
  const chatWindows = state?.chatWindows.filter(cw => cw.workspaceId === workspaceId) ?? [];
  const messages    = state?.messages.filter(m => m.chatWindowId === chatWindowId) ?? [];
  const selProject  = projects.find(p => p.id === projectId);
  const selCW       = chatWindows.find(cw => cw.id === chatWindowId);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* TOP BAR */}
      <div style={s.topbar}>
        <span style={s.appName}>AI Workspace</span>
        {error && <span style={s.topError}>⚠ {error}</span>}
        <button style={s.seedBtn} onClick={handleSeed} disabled={busy} title="Dev only — resets all data">
          Seed demo data
        </button>
      </div>

      {loading ? (
        <div style={s.loadingWrap}><span style={s.muted}>Loading…</span></div>
      ) : (
        <div style={s.columns}>

          {/* LEFT SIDEBAR — projects + workspaces */}
          <div style={s.sidebar}>
            <div style={s.colSection}>
              <p style={s.colLabel}>Projects</p>
              {projects.length === 0 && <p style={s.muted}>No projects yet.</p>}
              {projects.map(p => (
                <div
                  key={p.id}
                  style={{ ...s.navItem, ...(p.id === projectId ? s.navItemActive : {}) }}
                  onClick={() => selectProject(p.id)}
                >
                  {p.name}
                </div>
              ))}
              <div style={s.inlineForm}>
                <input
                  style={s.input}
                  placeholder="New project…"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                  disabled={busy}
                />
                <button style={s.iconBtn} onClick={handleCreateProject} disabled={busy || !newProjectName.trim()}>+</button>
              </div>
            </div>

            {selProject && (
              <div style={s.colSection}>
                <p style={s.colLabel}>Workspaces</p>
                <p style={s.dimLabel}>{selProject.name}</p>
                {workspaces.length === 0 && <p style={s.muted}>No workspaces.</p>}
                {workspaces.map(ws => (
                  <div
                    key={ws.id}
                    style={{ ...s.navItem, ...(ws.id === workspaceId ? s.navItemActive : {}) }}
                    onClick={() => selectWorkspace(ws.id)}
                  >
                    {ws.name}
                  </div>
                ))}
                <div style={s.inlineForm}>
                  <input
                    style={s.input}
                    placeholder="New workspace…"
                    value={newWorkspaceName}
                    onChange={e => setNewWorkspaceName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateWorkspace()}
                    disabled={busy}
                  />
                  <button style={s.iconBtn} onClick={handleCreateWorkspace} disabled={busy || !newWorkspaceName.trim()}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* MIDDLE — chat windows */}
          <div style={s.middle}>
            <div style={s.colSection}>
              <p style={s.colLabel}>Chat Windows</p>
              {!workspaceId && <p style={s.muted}>Select a workspace.</p>}
              {workspaceId && chatWindows.length === 0 && <p style={s.muted}>No windows yet.</p>}
              {chatWindows.map(cw => (
                <div
                  key={cw.id}
                  style={{ ...s.navItem, ...(cw.id === chatWindowId ? s.navItemActive : {}) }}
                  onClick={() => selectChatWindow(cw.id)}
                >
                  <span style={s.cwTitle}>{cw.title}</span>
                  <span style={s.cwBadge}>{cw.provider}</span>
                  <span style={s.cwModel}>{cw.model}</span>
                </div>
              ))}

              {workspaceId && (
                <div style={{ ...s.inlineForm, flexDirection: 'column', gap: '0.3rem' }}>
                  <input
                    style={s.input}
                    placeholder="Window title…"
                    value={newCwTitle}
                    onChange={e => setNewCwTitle(e.target.value)}
                    disabled={busy}
                  />
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <select
                      style={{ ...s.input, flex: 'none', width: '88px' }}
                      value={newCwProvider}
                      onChange={e => { const p = e.target.value as AIProvider; setNewCwProvider(p); setNewCwModel(DEFAULT_MODEL[p]); }}
                      disabled={busy}
                    >
                      {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      style={s.input}
                      placeholder="model"
                      value={newCwModel}
                      onChange={e => setNewCwModel(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <button
                    style={{ ...s.btn, width: '100%' }}
                    onClick={handleCreateChatWindow}
                    disabled={busy || !newCwTitle.trim() || !newCwModel.trim()}
                  >
                    + New Window
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* MAIN — thread */}
          <div style={s.main}>
            {!selCW ? (
              <div style={s.threadEmpty}>
                <p style={s.muted}>Select a chat window to start.</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div style={s.threadHeader}>
                  <span style={s.threadTitle}>{selCW.title}</span>
                  <span style={s.threadMeta}>{selCW.provider} · {selCW.model}</span>
                </div>

                {/* Messages */}
                <div style={s.thread} ref={threadRef}>
                  {messages.length === 0 && (
                    <p style={{ ...s.muted, padding: '1rem' }}>No messages yet. Start the conversation.</p>
                  )}
                  {messages.map(m => (
                    <div key={m.id} style={{ ...s.msg, ...(m.role === 'user' ? s.msgUser : s.msgOther) }}>
                      <span style={s.msgRole}>{m.role}</span>
                      <span style={s.msgContent}>{m.content}</span>
                    </div>
                  ))}
                </div>

                {/* Composer */}
                <div style={s.composer}>
                  <input
                    style={{ ...s.input, flex: 1, fontSize: '0.9rem', padding: '0.55rem 0.75rem' }}
                    placeholder={`Message in ${selCW.title}…`}
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    disabled={busy}
                  />
                  <button
                    style={{ ...s.btn, padding: '0.55rem 1.1rem' }}
                    onClick={handleSendMessage}
                    disabled={busy || !newMessage.trim()}
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: 'system-ui' }}>
        Loading…
      </div>
    }>
      <WorkspaceApp />
    </Suspense>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const s = {
  root:        { display: 'flex', flexDirection: 'column' as const, height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', color: '#d4d4d8' },
  topbar:      { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1rem', height: '48px', background: '#0d0d10', borderBottom: '1px solid #1a1a20', flexShrink: 0 },
  appName:     { fontWeight: 600, fontSize: '0.95rem', color: '#f5f5f5', marginRight: 'auto' },
  topError:    { fontSize: '0.8rem', color: '#f87171' },
  seedBtn:     { fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: 'transparent', border: '1px solid #2a2a30', borderRadius: '4px', color: '#555', cursor: 'pointer' },
  loadingWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  muted:       { fontSize: '0.8rem', color: '#444', margin: '0.2rem 0' },

  columns: { display: 'flex', flex: 1, overflow: 'hidden' },

  sidebar: { width: '210px', flexShrink: 0, overflowY: 'auto' as const, borderRight: '1px solid #1a1a20', background: '#0d0d10' },
  middle:  { width: '220px', flexShrink: 0, overflowY: 'auto' as const, borderRight: '1px solid #1a1a20', background: '#0d0d10' },
  main:    { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', background: '#0b0b0d' },

  colSection: { padding: '0.75rem 0.6rem', borderBottom: '1px solid #141418' },
  colLabel:   { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#3f3f46', margin: '0 0 0.4rem' },
  dimLabel:   { fontSize: '0.75rem', color: '#555', margin: '0 0 0.35rem' },

  navItem:       { padding: '0.35rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', color: '#71717a', lineHeight: 1.4 },
  navItemActive: { background: '#1e1e2e', color: '#a5b4fc' },

  inlineForm: { display: 'flex', gap: '0.3rem', marginTop: '0.5rem' },
  input:      { flex: 1, minWidth: 0, background: '#111116', border: '1px solid #22222a', borderRadius: '4px', padding: '0.35rem 0.5rem', color: '#e4e4e7', fontSize: '0.82rem', outline: 'none' },
  iconBtn:    { flexShrink: 0, width: '26px', height: '26px', background: '#1e1e2e', border: '1px solid #2d2d40', borderRadius: '4px', color: '#a5b4fc', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 },
  btn:        { padding: '0.35rem 0.7rem', background: '#1e1e2e', border: '1px solid #2d2d40', borderRadius: '4px', color: '#a5b4fc', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },

  cwTitle: { display: 'block', fontSize: '0.85rem', lineHeight: 1.3 },
  cwBadge: { display: 'block', fontSize: '0.7rem', color: '#52525b', marginTop: '0.1rem' },
  cwModel: { display: 'block', fontSize: '0.7rem', color: '#3f3f46' },

  threadEmpty:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  threadHeader: { padding: '0.75rem 1.25rem', borderBottom: '1px solid #1a1a20', flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: '0.75rem' },
  threadTitle:  { fontSize: '0.95rem', fontWeight: 600, color: '#e4e4e7' },
  threadMeta:   { fontSize: '0.78rem', color: '#52525b' },

  thread:  { flex: 1, overflowY: 'auto' as const, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  msg:     { display: 'flex', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '6px', alignItems: 'flex-start' },
  msgUser:  { background: '#0f1729' },
  msgOther: { background: '#111116' },
  msgRole:    { fontSize: '0.72rem', fontWeight: 600, color: '#52525b', minWidth: '52px', paddingTop: '0.15rem', flexShrink: 0 },
  msgContent: { fontSize: '0.875rem', color: '#d4d4d8', lineHeight: 1.5, wordBreak: 'break-word' as const },

  composer: { padding: '0.75rem 1.25rem', borderTop: '1px solid #1a1a20', display: 'flex', gap: '0.5rem', flexShrink: 0 },
} as const;
