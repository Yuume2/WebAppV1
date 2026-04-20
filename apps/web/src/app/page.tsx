'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { AppState, AIProvider } from '@webapp/types';
import {
  fetchState, createProject, createWorkspace,
  createChatWindow, createMessage, devSeed,
} from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { ChatWindowList } from '@/components/ChatWindowList';
import { ThreadPanel } from '@/components/ThreadPanel';
import { s } from './ws-styles';

const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  perplexity: 'sonar',
};

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

  const projects    = state?.projects ?? [];
  const workspaces  = state?.workspaces.filter(ws => ws.projectId === projectId) ?? [];
  const chatWindows = state?.chatWindows.filter(cw => cw.workspaceId === workspaceId) ?? [];
  const messages    = state?.messages.filter(m => m.chatWindowId === chatWindowId) ?? [];
  const selCW       = chatWindows.find(cw => cw.id === chatWindowId) ?? null;

  return (
    <div style={s.root}>
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
          <Sidebar
            projects={projects}
            workspaces={workspaces}
            projectId={projectId}
            workspaceId={workspaceId}
            onSelectProject={selectProject}
            onSelectWorkspace={selectWorkspace}
            newProjectName={newProjectName}
            onNewProjectName={setNewProjectName}
            onCreateProject={handleCreateProject}
            newWorkspaceName={newWorkspaceName}
            onNewWorkspaceName={setNewWorkspaceName}
            onCreateWorkspace={handleCreateWorkspace}
            busy={busy}
          />
          <ChatWindowList
            chatWindows={chatWindows}
            workspaceId={workspaceId}
            chatWindowId={chatWindowId}
            onSelectChatWindow={selectChatWindow}
            newCwTitle={newCwTitle}
            onNewCwTitle={setNewCwTitle}
            newCwProvider={newCwProvider}
            onNewCwProvider={setNewCwProvider}
            newCwModel={newCwModel}
            onNewCwModel={setNewCwModel}
            onCreateChatWindow={handleCreateChatWindow}
            busy={busy}
          />
          <ThreadPanel
            selCW={selCW}
            messages={messages}
            newMessage={newMessage}
            onNewMessage={setNewMessage}
            onSendMessage={handleSendMessage}
            threadRef={threadRef}
            busy={busy}
          />
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
