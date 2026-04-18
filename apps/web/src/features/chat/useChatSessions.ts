'use client';

import { useCallback, useState } from 'react';
import type { MockMessage } from '@/lib/data';

export interface ChatSessionsApi {
  getMessages: (windowId: string) => MockMessage[];
  sendUserMessage: (windowId: string, content: string) => void;
}

export function useChatSessions(initial: Record<string, MockMessage[]>): ChatSessionsApi {
  const [sessions, setSessions] = useState<Record<string, MockMessage[]>>(initial);

  const getMessages = useCallback(
    (windowId: string) => sessions[windowId] ?? [],
    [sessions],
  );

  const sendUserMessage = useCallback((windowId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSessions((prev) => {
      const current = prev[windowId] ?? [];
      const next: MockMessage = {
        id: `local-${windowId}-${Date.now()}`,
        windowId,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, [windowId]: [...current, next] };
    });
  }, []);

  return { getMessages, sendUserMessage };
}
