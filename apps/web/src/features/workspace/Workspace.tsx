'use client';

import type { ChatWindow, Workspace as WorkspaceType } from '@webapp/types';
import type { MockMessage } from '@/lib/data';
import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useWorkspaceState } from '@/features/workspace/useWorkspaceState';
import { useChatSessions } from '@/features/chat/useChatSessions';
import { WorkspaceSidebar } from '@/features/workspace/WorkspaceSidebar';
import { WorkspaceCanvas } from '@/features/workspace/WorkspaceCanvas';
import { WorkspaceCommandPalette } from '@/features/workspace/WorkspaceCommandPalette';
import { useToast } from '@/components/ToastHost';
import type { ApiCallError } from '@/lib/api/client';

interface WorkspaceProps {
  projectId: string;
  projectName: string;
  workspaces: WorkspaceType[];
  activeWorkspace: WorkspaceType;
  windows: ChatWindow[];
  messagesByWindow: Record<string, MockMessage[]>;
}

export function Workspace({
  projectId,
  projectName,
  workspaces,
  activeWorkspace,
  windows,
  messagesByWindow,
}: WorkspaceProps) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialWindowParam = searchParams?.get('window') ?? null;
  const handleWindowError = useCallback(
    (action: 'rename' | 'delete', err: ApiCallError, win?: ChatWindow) => {
      const verb = action === 'rename' ? 'Rename failed' : 'Delete failed';
      const target = win?.title ? `“${win.title}”` : 'window';
      const code = err.code ?? 'error';
      toast.push('error', `${verb} for ${target}: ${code} — ${err.message}`);
    },
    [toast],
  );
  const state = useWorkspaceState({
    windows,
    initialActiveId: initialWindowParam,
    onError: handleWindowError,
  });
  const lastSyncedWindowRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname) return;
    const current = state.activeId;
    if (lastSyncedWindowRef.current === current) return;
    lastSyncedWindowRef.current = current;
    if (current && current.startsWith('local-')) return;
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.set('workspace', activeWorkspace.id);
    if (current) next.set('window', current);
    else next.delete('window');
    const target = `${pathname}?${next.toString()}`;
    router.replace(target, { scroll: false });
  }, [pathname, router, searchParams, state.activeId, activeWorkspace.id]);
  const handleSendError = useCallback(
    (chatWindowId: string, err: ApiCallError) => {
      const win = windows.find((w) => w.id === chatWindowId);
      const prefix = win?.title ?? 'Send failed';
      const code = err.code ?? 'error';
      if (code === 'provider_not_configured') {
        toast.push('error', `${prefix}: ${err.message}`, {
          action: { label: 'Add provider key →', href: '/settings/providers' },
        });
        return;
      }
      toast.push('error', `${prefix}: ${code} — ${err.message}`);
    },
    [toast, windows],
  );
  const chat = useChatSessions(messagesByWindow, {
    onError: handleSendError,
    stream: true,
  });

  const lastActivityByWindow: Record<string, string | undefined> = {};
  const pendingByWindow: Record<string, boolean> = {};
  const lastAssistantByWindow: Record<string, string | undefined> = {};
  for (const w of [...state.visibleWindows, ...state.closedWindows]) {
    const list = chat.getMessages(w.id);
    const last = list[list.length - 1];
    lastActivityByWindow[w.id] = last?.createdAt;
    pendingByWindow[w.id] = chat.isPending(w.id);
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const m = list[i];
      if (!m) continue;
      if (m.role === 'assistant' && (m.status ?? 'ok') === 'ok') {
        lastAssistantByWindow[w.id] = m.createdAt;
        break;
      }
    }
  }

  const lastSeenRef = useRef<Record<string, number>>({});
  const initSeenRef = useRef(false);
  if (!initSeenRef.current) {
    const now = Date.now();
    for (const w of [...state.visibleWindows, ...state.closedWindows]) {
      lastSeenRef.current[w.id] = now;
    }
    initSeenRef.current = true;
  }
  useEffect(() => {
    if (!state.activeId) return;
    lastSeenRef.current[state.activeId] = Date.now();
  }, [state.activeId, lastActivityByWindow[state.activeId ?? '']]);

  const unreadByWindow: Record<string, boolean> = {};
  for (const w of [...state.visibleWindows, ...state.closedWindows]) {
    const ts = lastAssistantByWindow[w.id];
    const seenAt = lastSeenRef.current[w.id];
    if (!ts || w.id === state.activeId) {
      unreadByWindow[w.id] = false;
      continue;
    }
    const messageTime = Date.parse(ts);
    if (Number.isNaN(messageTime)) {
      unreadByWindow[w.id] = false;
      continue;
    }
    unreadByWindow[w.id] = seenAt == null ? true : messageTime > seenAt;
  }
  const totalUnread = Object.values(unreadByWindow).filter(Boolean).length;

  const previousTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (previousTitleRef.current == null) {
      previousTitleRef.current = document.title;
    }
  }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = `${projectName} · ${activeWorkspace.name} — AI Workspace V1`;
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
  }, [totalUnread, projectName, activeWorkspace.name]);
  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') return;
      if (previousTitleRef.current != null) document.title = previousTitleRef.current;
    };
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <WorkspaceSidebar
        projectId={projectId}
        projectName={projectName}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace.id}
        visibleWindows={state.visibleWindows}
        closedWindows={state.closedWindows}
        activeId={state.activeId}
        lastActivityByWindow={lastActivityByWindow}
        pendingByWindow={pendingByWindow}
        unreadByWindow={unreadByWindow}
        onFocus={state.focus}
        onClose={state.close}
        onReopen={state.reopen}
        onCreate={state.createWindow}
        onReset={state.reset}
      />
      <WorkspaceCanvas
        workspaceId={activeWorkspace.id}
        totalWindows={state.visibleWindows.length + state.closedWindows.length}
        visibleWindows={state.visibleWindows}
        getMessages={chat.getMessages}
        isPending={chat.isPending}
        onSend={chat.sendUserMessage}
        onRetry={chat.retry}
        onRegenerate={chat.regenerate}
        onCancel={chat.cancel}
        activeId={state.activeId}
        hasClosed={state.closedWindows.length > 0}
        onClose={state.close}
        onFocus={state.focus}
        onRename={state.renameWindow}
        onDelete={state.deleteWindow}
        onReset={state.reset}
        onCreate={state.createWindow}
      />
      <WorkspaceCommandPalette
        projectId={projectId}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace.id}
        visibleWindows={state.visibleWindows}
        closedWindows={state.closedWindows}
        activeId={state.activeId}
        unreadByWindow={unreadByWindow}
        onFocus={state.focus}
        onReopen={state.reopen}
      />
    </div>
  );
}
