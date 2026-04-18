'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ChatWindow } from '@webapp/types';

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
  addMockWindow: () => void;
}

const MOCK_PRESETS: Array<Pick<ChatWindow, 'provider' | 'model'>> = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'perplexity', model: 'sonar-pro' },
];

let mockCounter = 0;
function makeMockWindow(workspaceId: string): ChatWindow {
  mockCounter += 1;
  const preset = MOCK_PRESETS[mockCounter % MOCK_PRESETS.length]!;
  const now = new Date().toISOString();
  return {
    id: `mock-${Date.now()}-${mockCounter}`,
    workspaceId,
    title: `Mock window ${mockCounter}`,
    provider: preset.provider,
    model: preset.model,
    createdAt: now,
    updatedAt: now,
  };
}

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

  const addMockWindow = useCallback(() => {
    const workspaceId = windows[0]?.workspaceId ?? 'mock-ws';
    const w = makeMockWindow(workspaceId);
    setPool((prev) => [...prev, w]);
    setOpenIds((prev) => [...prev, w.id]);
    setActiveId(w.id);
  }, [windows]);

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
    addMockWindow,
  };
}
