'use client';

import type { ChatWindow, Workspace as WorkspaceType } from '@webapp/types';
import type { MockMessage } from '@/lib/data';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const activeLastActivity = state.activeId ? lastActivityByWindow[state.activeId] : undefined;
  useEffect(() => {
    if (!state.activeId) return;
    lastSeenRef.current[state.activeId] = Date.now();
    if (typeof window !== 'undefined') {
      try {
        const key = `wav.workspace.recents.${activeWorkspace.id}`;
        const raw = window.sessionStorage.getItem(key);
        const list: string[] = raw ? (JSON.parse(raw) as string[]).filter((x) => typeof x === 'string') : [];
        const next = [state.activeId, ...list.filter((x) => x !== state.activeId)].slice(0, 8);
        window.sessionStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new Event('wav:recents-changed'));
      } catch {
        // ignore
      }
    }
  }, [state.activeId, activeLastActivity, activeWorkspace.id]);

  const visibleWindowsForKey = state.visibleWindows;
  const activeIdForKey = state.activeId;
  const focusForKey = state.focus;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const target = e.target;
      const typing = target instanceof HTMLElement
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;
      const ids = visibleWindowsForKey.map((w) => w.id);
      if (ids.length === 0) return;
      e.preventDefault();
      const idx = activeIdForKey ? ids.indexOf(activeIdForKey) : -1;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx = idx < 0 ? 0 : (idx + dir + ids.length) % ids.length;
      const target2 = ids[nextIdx];
      if (target2) focusForKey(target2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleWindowsForKey, activeIdForKey, focusForKey]);

  const unreadByWindow: Record<string, boolean> = {};
  const unreadCountByWindow: Record<string, number> = {};
  for (const w of [...state.visibleWindows, ...state.closedWindows]) {
    const ts = lastAssistantByWindow[w.id];
    const seenAt = lastSeenRef.current[w.id];
    if (!ts || w.id === state.activeId) {
      unreadByWindow[w.id] = false;
      unreadCountByWindow[w.id] = 0;
      continue;
    }
    const messageTime = Date.parse(ts);
    if (Number.isNaN(messageTime)) {
      unreadByWindow[w.id] = false;
      unreadCountByWindow[w.id] = 0;
      continue;
    }
    const isUnread = seenAt == null ? true : messageTime > seenAt;
    unreadByWindow[w.id] = isUnread;
    if (!isUnread) {
      unreadCountByWindow[w.id] = 0;
      continue;
    }
    let count = 0;
    const list = chat.getMessages(w.id);
    for (const m of list) {
      if (m.role !== 'assistant') continue;
      if ((m.status ?? 'ok') !== 'ok') continue;
      const t = Date.parse(m.createdAt);
      if (Number.isNaN(t)) continue;
      if (seenAt == null || t > seenAt) count += 1;
    }
    unreadCountByWindow[w.id] = count;
  }
  const totalUnread = Object.values(unreadByWindow).filter(Boolean).length;
  const totalUnreadMessages = Object.values(unreadCountByWindow).reduce((a, b) => a + b, 0);
  const anyPending = Object.values(pendingByWindow).some(Boolean);

  const [, forceTick] = useState(0);
  const markAllAsRead = () => {
    const now = Date.now();
    for (const id of Object.keys(unreadByWindow)) {
      if (unreadByWindow[id]) lastSeenRef.current[id] = now;
    }
    forceTick((n: number) => n + 1);
  };

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
    const prefix =
      totalUnreadMessages > 0
        ? `(${totalUnreadMessages}) `
        : totalUnread > 0
          ? `(${totalUnread}) `
          : anyPending
            ? '… '
            : '';
    document.title = `${prefix}${base}`;
  }, [totalUnread, totalUnreadMessages, anyPending, projectName, activeWorkspace.name]);
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
        unreadCountByWindow={unreadCountByWindow}
        onMarkAllAsRead={totalUnread > 0 ? markAllAsRead : undefined}
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
        unreadCountByWindow={unreadCountByWindow}
        getMessages={chat.getMessages}
        onFocus={state.focus}
        onReopen={state.reopen}
      />
    </div>
  );
}
