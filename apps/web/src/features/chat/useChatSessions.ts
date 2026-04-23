'use client';

import { useCallback, useState } from 'react';
import type { MockMessage } from '@/lib/data';

export interface ChatSessionsApi {
  getMessages: (chatWindowId: string) => MockMessage[];
  sendUserMessage: (chatWindowId: string, content: string) => void;
}

export function useChatSessions(initial: Record<string, MockMessage[]>): ChatSessionsApi {
  const [sessions, setSessions] = useState<Record<string, MockMessage[]>>(initial);

  const getMessages = useCallback(
    (chatWindowId: string) => sessions[chatWindowId] ?? [],
    [sessions],
  );

  const sendUserMessage = useCallback((chatWindowId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSessions((prev) => {
      const current = prev[chatWindowId] ?? [];
      const next: MockMessage = {
        id: `local-${chatWindowId}-${Date.now()}`,
        chatWindowId,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, [chatWindowId]: [...current, next] };
    });
  }, []);

  return { getMessages, sendUserMessage };
}
