'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AppState, AIProvider } from '@webapp/types';
import {
  fetchState,
  createProject,
  createWorkspace,
  createChatWindow,
  createMessage,
  devSeed,
} from '@/lib/api';

const PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'perplexity'];
const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  perplexity: 'sonar',
};

export default function HomePage() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedChatWindowId, setSelectedChatWindowId] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newCwTitle, setNewCwTitle] = useState('');
  const [newCwProvider, setNewCwProvider] = useState<AIProvider>('openai');
  const [newCwModel, setNewCwModel] = useState(DEFAULT_MODEL.openai);
  const [newMessageContent, setNewMessageContent] = useState('');

  const reload = useCallback(async () => {
    try {
      const s = await fetchState();
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    await run(async () => {
      const p = await createProject({ name: newProjectName.trim() });
      await reload();
      setSelectedProjectId(p.id);
      setSelectedWorkspaceId(null);
      setSelectedChatWindowId(null);
      setNewProjectName('');
    });
  }

  async function handleCreateWorkspace() {
    if (!selectedProjectId || !newWorkspaceName.trim()) return;
    await run(async () => {
      const ws = await createWorkspace({ projectId: selectedProjectId, name: newWorkspaceName.trim() });
      await reload();
      setSelectedWorkspaceId(ws.id);
      setSelectedChatWindowId(null);
      setNewWorkspaceName('');
    });
  }

  async function handleCreateChatWindow() {
    if (!selectedWorkspaceId || !newCwTitle.trim() || !newCwModel.trim()) return;
    await run(async () => {
      const cw = await createChatWindow({
        workspaceId: selectedWorkspaceId,
        title: newCwTitle.trim(),
        provider: newCwProvider,
        model: newCwModel.trim(),
      });
      await reload();
      setSelectedChatWindowId(cw.id);
      setNewCwTitle('');
    });
  }

  async function handleSendMessage() {
    if (!selectedChatWindowId || !newMessageContent.trim()) return;
    await run(async () => {
      await createMessage({
        chatWindowId: selectedChatWindowId,
        role: 'user',
        content: newMessageContent.trim(),
      });
      await reload();
      setNewMessageContent('');
    });
  }

  async function handleSeed() {
    await run(async () => {
      await devSeed();
      await reload();
      setSelectedProjectId(null);
      setSelectedWorkspaceId(null);
      setSelectedChatWindowId(null);
    });
  }

  const projects = state?.projects ?? [];
  const workspaces = state?.workspaces.filter(ws => ws.projectId === selectedProjectId) ?? [];
  const chatWindows = state?.chatWindows.filter(cw => cw.workspaceId === selectedWorkspaceId) ?? [];
  const messages = state?.messages.filter(m => m.chatWindowId === selectedChatWindowId) ?? [];

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const selectedWorkspace = workspaces.find(ws => ws.id === selectedWorkspaceId);
  const selectedChatWindow = chatWindows.find(cw => cw.id === selectedChatWindowId);

  if (loading) return <main style={s.main}><p style={s.muted}>Loading…</p></main>;

  return (
    <main style={s.main}>
      <div style={s.header}>
        <h1 style={s.heading}>AI Workspace V1</h1>
        <button style={s.seedBtn} onClick={handleSeed} disabled={busy} title="Dev only">
          Seed demo data
        </button>
      </div>

      {error && <p style={s.error}>⚠ {error}</p>}

      {/* PROJECTS */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>Projects</h2>
        {projects.length === 0 && <p style={s.muted}>No projects. Create one below or seed demo data.</p>}
        <ul style={s.itemList}>
          {projects.map(p => (
            <li
              key={p.id}
              style={{ ...s.item, ...(p.id === selectedProjectId ? s.itemSelected : {}) }}
              onClick={() => {
                setSelectedProjectId(p.id);
                setSelectedWorkspaceId(null);
                setSelectedChatWindowId(null);
              }}
            >
              <span>{p.name}</span>
              {p.description && <span style={s.dim}>{p.description}</span>}
            </li>
          ))}
        </ul>
        <div style={s.form}>
          <input
            style={s.input}
            placeholder="New project name"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
            disabled={busy}
          />
          <button style={s.btn} onClick={handleCreateProject} disabled={busy || !newProjectName.trim()}>
            + Project
          </button>
        </div>
      </section>

      {/* WORKSPACES */}
      {selectedProject && (
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Workspaces — {selectedProject.name}</h2>
          {workspaces.length === 0 && <p style={s.muted}>No workspaces yet.</p>}
          <ul style={s.itemList}>
            {workspaces.map(ws => (
              <li
                key={ws.id}
                style={{ ...s.item, ...(ws.id === selectedWorkspaceId ? s.itemSelected : {}) }}
                onClick={() => { setSelectedWorkspaceId(ws.id); setSelectedChatWindowId(null); }}
              >
                {ws.name}
              </li>
            ))}
          </ul>
          <div style={s.form}>
            <input
              style={s.input}
              placeholder="New workspace name"
              value={newWorkspaceName}
              onChange={e => setNewWorkspaceName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateWorkspace()}
              disabled={busy}
            />
            <button style={s.btn} onClick={handleCreateWorkspace} disabled={busy || !newWorkspaceName.trim()}>
              + Workspace
            </button>
          </div>
        </section>
      )}

      {/* CHAT WINDOWS */}
      {selectedWorkspace && (
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Chat Windows — {selectedWorkspace.name}</h2>
          {chatWindows.length === 0 && <p style={s.muted}>No chat windows yet.</p>}
          <ul style={s.itemList}>
            {chatWindows.map(cw => (
              <li
                key={cw.id}
                style={{ ...s.item, ...(cw.id === selectedChatWindowId ? s.itemSelected : {}) }}
                onClick={() => setSelectedChatWindowId(cw.id)}
              >
                <span>{cw.title}</span>
                <span style={s.badge}>{cw.provider} · {cw.model}</span>
              </li>
            ))}
          </ul>
          <div style={s.form}>
            <input
              style={{ ...s.input, flex: 2 }}
              placeholder="Window title"
              value={newCwTitle}
              onChange={e => setNewCwTitle(e.target.value)}
              disabled={busy}
            />
            <select
              style={s.select}
              value={newCwProvider}
              onChange={e => {
                const p = e.target.value as AIProvider;
                setNewCwProvider(p);
                setNewCwModel(DEFAULT_MODEL[p]);
              }}
              disabled={busy}
            >
              {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              style={s.input}
              placeholder="Model"
              value={newCwModel}
              onChange={e => setNewCwModel(e.target.value)}
              disabled={busy}
            />
            <button
              style={s.btn}
              onClick={handleCreateChatWindow}
              disabled={busy || !newCwTitle.trim() || !newCwModel.trim()}
            >
              + Window
            </button>
          </div>
        </section>
      )}

      {/* MESSAGES */}
      {selectedChatWindow && (
        <section style={s.section}>
          <h2 style={s.sectionTitle}>{selectedChatWindow.title}</h2>
          <div style={s.thread}>
            {messages.length === 0 && <p style={s.muted}>No messages yet.</p>}
            {messages.map(m => (
              <div key={m.id} style={{ ...s.msg, ...(m.role === 'user' ? s.msgUser : s.msgAssistant) }}>
                <span style={s.role}>{m.role}</span>
                <span>{m.content}</span>
              </div>
            ))}
          </div>
          <div style={s.form}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="Type a message…"
              value={newMessageContent}
              onChange={e => setNewMessageContent(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              disabled={busy}
            />
            <button style={s.btn} onClick={handleSendMessage} disabled={busy || !newMessageContent.trim()}>
              Send
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

const s = {
  main: { minHeight: '100vh', padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  heading: { fontSize: '1.75rem', margin: 0, color: '#f5f5f5' },
  seedBtn: { fontSize: '0.75rem', padding: '0.3rem 0.7rem', background: '#1a1a1e', border: '1px solid #333', borderRadius: '4px', color: '#666', cursor: 'pointer' },
  error: { color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem' },
  section: { marginBottom: '1.5rem', borderLeft: '2px solid #1e1e22', paddingLeft: '1rem' },
  sectionTitle: { fontSize: '0.85rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#555', margin: '0 0 0.5rem' },
  itemList: { listStyle: 'none', padding: 0, margin: '0 0 0.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.2rem' },
  item: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', color: '#ccc', background: 'transparent' },
  itemSelected: { background: '#1a1a2e', color: '#a5b4fc', borderLeft: '2px solid #4f46e5', paddingLeft: '0.4rem' },
  dim: { fontSize: '0.8rem', color: '#555' },
  badge: { fontSize: '0.72rem', color: '#555', background: '#111', padding: '0.1rem 0.35rem', borderRadius: '3px' },
  form: { display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem' },
  input: { flex: 1, background: '#111113', border: '1px solid #2a2a2e', borderRadius: '4px', padding: '0.4rem 0.6rem', color: '#e5e5e5', fontSize: '0.85rem', outline: 'none' },
  select: { background: '#111113', border: '1px solid #2a2a2e', borderRadius: '4px', padding: '0.4rem 0.5rem', color: '#e5e5e5', fontSize: '0.85rem' },
  btn: { padding: '0.4rem 0.8rem', background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: '4px', color: '#a5b4fc', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  thread: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem', marginBottom: '0.75rem', maxHeight: '320px', overflowY: 'auto' as const, padding: '0.25rem 0' },
  msg: { padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' },
  msgUser: { background: '#111a2e', color: '#c7d2fe' },
  msgAssistant: { background: '#111113', color: '#aaa' },
  role: { fontSize: '0.75rem', color: '#555', minWidth: '4.5rem', paddingTop: '0.1rem' },
  muted: { fontSize: '0.8rem', color: '#444', margin: '0.2rem 0' },
} as const;
