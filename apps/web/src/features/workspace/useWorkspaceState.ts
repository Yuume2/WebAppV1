'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ChatWindow } from '@webapp/types';
import type { WindowPreset } from '@/lib/data';
import { createChatWindow } from '@/lib/api/chat-windows';
import { getApiBaseUrl } from '@/lib/api/env';

interface WorkspaceStateInit {
  windows: ChatWindow[];
}

interface WorkspaceState {
  openIds: string[];
  closedIds: string[];
  activeId: string | null;
  visibleWindows: ChatWindow[];
  closedWindows: ChatWindow[];
  close: (id: string) => void;
  reopen: (id: string) => void;
  focus: (id: string) => void;
  reset: () => void;
  createWindow: (preset: WindowPreset, customTitle?: string) => string;
  renameWindow: (id: string, title: string) => void;
}

let creationCounter = 0;

export function useWorkspaceState({ windows }: WorkspaceStateInit): WorkspaceState {
  const initialIds = useMemo(() => windows.map((w) => w.id), [windows]);
  const [pool, setPool] = useState<ChatWindow[]>(windows);
  const [openIds, setOpenIds] = useState<string[]>(initialIds);
  const [activeId, setActiveId] = useState<string | null>(initialIds[0] ?? null);

  const close = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      setActiveId((current) => (current === id ? (next[0] ?? null) : current));
      return next;
    });
  }, []);

  const reopen = useCallback((id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
  }, []);

  const focus = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const reset = useCallback(() => {
    setPool(windows);
    setOpenIds(initialIds);
    setActiveId(initialIds[0] ?? null);
  }, [windows, initialIds]);

  const createWindow = useCallback(
    (preset: WindowPreset, customTitle?: string) => {
      creationCounter += 1;
      const workspaceId = windows[0]?.workspaceId ?? 'local-ws';
      const now = new Date().toISOString();
      const title = customTitle?.trim() || preset.defaultTitle;
      const tempId = `local-${Date.now()}-${creationCounter}`;
      const optimistic: ChatWindow = {
        id: tempId,
        workspaceId,
        title,
        provider: preset.provider,
        model: preset.model,
        createdAt: now,
        updatedAt: now,
      };
      setPool((prev) => [...prev, optimistic]);
      setOpenIds((prev) => [...prev, tempId]);
      setActiveId(tempId);

      if (getApiBaseUrl() && workspaceId !== 'local-ws') {
        void createChatWindow({
          workspaceId,
          title,
          provider: preset.provider,
          model: preset.model,
        })
          .then((persisted) => {
            setPool((prev) => prev.map((w) => (w.id === tempId ? persisted : w)));
            setOpenIds((prev) => prev.map((id) => (id === tempId ? persisted.id : id)));
            setActiveId((current) => (current === tempId ? persisted.id : current));
          })
          .catch(() => {
            setPool((prev) => prev.filter((w) => w.id !== tempId));
            setOpenIds((prev) => prev.filter((id) => id !== tempId));
            setActiveId((current) => (current === tempId ? null : current));
          });
      }

      return tempId;
    },
    [windows],
  );

  const renameWindow = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setPool((prev) => prev.map((w) => (w.id === id ? { ...w, title: trimmed } : w)));
  }, []);

  const visibleWindows = useMemo(
    () => openIds.map((id) => pool.find((w) => w.id === id)).filter((w): w is ChatWindow => Boolean(w)),
    [openIds, pool],
  );

  const closedWindows = useMemo(
    () => pool.filter((w) => !openIds.includes(w.id)),
    [pool, openIds],
  );

  return {
    openIds,
    closedIds: closedWindows.map((w) => w.id),
    activeId,
    visibleWindows,
    closedWindows,
    close,
    reopen,
    focus,
    reset,
    createWindow,
    renameWindow,
  };
}
