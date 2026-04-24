'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MockMessage } from '@/lib/data';
import { getApiBaseUrl } from '@/lib/api/env';
import { isGeneratedPair, postMessage, type PostMessageResult } from '@/lib/api/messages';
import type { ApiCallError } from '@/lib/api/client';

export interface ChatSessionsApi {
  getMessages: (chatWindowId: string) => MockMessage[];
  isPending: (chatWindowId: string) => boolean;
  sendUserMessage: (chatWindowId: string, content: string) => void;
  retry: (chatWindowId: string, clientTempId: string) => void;
  cancel: (chatWindowId: string) => void;
}

interface SessionState {
  messages: MockMessage[];
  pendingTempId: string | null;
}

type Sessions = Record<string, SessionState>;

let tempCounter = 0;
function nextTempId(chatWindowId: string): string {
  tempCounter += 1;
  return `tmp-${chatWindowId}-${Date.now()}-${tempCounter}`;
}

function toSessions(initial: Record<string, MockMessage[]>): Sessions {
  const out: Sessions = {};
  for (const [id, list] of Object.entries(initial)) {
    out[id] = {
      messages: list.map((m) => ({ ...m, status: m.status ?? 'ok' })),
      pendingTempId: null,
    };
  }
  return out;
}

function asApiCallError(err: unknown): ApiCallError {
  if (err && typeof err === 'object' && 'message' in err) return err as ApiCallError;
  return new Error(typeof err === 'string' ? err : 'Unknown error') as ApiCallError;
}

export function useChatSessions(initial: Record<string, MockMessage[]>): ChatSessionsApi {
  const [sessions, setSessions] = useState<Sessions>(() => toSessions(initial));
  const controllers = useRef<Map<string, AbortController>>(new Map());
  const sessionsRef = useRef<Sessions>(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    const map = controllers.current;
    return () => {
      map.forEach((c) => c.abort());
      map.clear();
    };
  }, []);

  const getMessages = useCallback(
    (chatWindowId: string): MockMessage[] => sessions[chatWindowId]?.messages ?? [],
    [sessions],
  );

  const isPending = useCallback(
    (chatWindowId: string): boolean => sessions[chatWindowId]?.pendingTempId != null,
    [sessions],
  );

  const fulfillSuccess = useCallback(
    (chatWindowId: string, tempId: string, result: PostMessageResult) => {
      setSessions((prev) => {
        const current = prev[chatWindowId];
        if (!current) return prev;
        const userRow = isGeneratedPair(result) ? result.userMessage : result;
        const assistantRow = isGeneratedPair(result) ? result.assistantMessage : null;
        const replaced: MockMessage[] = current.messages.map((m) => {
          if (m.clientTempId !== tempId) return m;
          return {
            id: userRow.id,
            chatWindowId: userRow.chatWindowId,
            role: userRow.role,
            content: userRow.content,
            createdAt: userRow.createdAt,
            status: 'ok',
          };
        });
        const withAssistant: MockMessage[] = assistantRow
          ? [
              ...replaced,
              {
                id: assistantRow.id,
                chatWindowId: assistantRow.chatWindowId,
                role: assistantRow.role,
                content: assistantRow.content,
                createdAt: assistantRow.createdAt,
                provider: assistantRow.provider ?? undefined,
                model: assistantRow.model ?? undefined,
                status: 'ok',
              },
            ]
          : replaced;
        return {
          ...prev,
          [chatWindowId]: {
            messages: withAssistant,
            pendingTempId: current.pendingTempId === tempId ? null : current.pendingTempId,
          },
        };
      });
    },
    [],
  );

  const fulfillError = useCallback(
    (chatWindowId: string, tempId: string, err: unknown) => {
      const e = asApiCallError(err);
      setSessions((prev) => {
        const current = prev[chatWindowId];
        if (!current) return prev;
        return {
          ...prev,
          [chatWindowId]: {
            messages: current.messages.map((m) =>
              m.clientTempId === tempId
                ? {
                    ...m,
                    status: 'failed',
                    errorCode: e.code ?? 'error',
                    errorMessage: e.message,
                  }
                : m,
            ),
            pendingTempId: current.pendingTempId === tempId ? null : current.pendingTempId,
          },
        };
      });
    },
    [],
  );

  const dispatchPost = useCallback(
    (chatWindowId: string, tempId: string, content: string) => {
      const ctrl = new AbortController();
      controllers.current.get(chatWindowId)?.abort();
      controllers.current.set(chatWindowId, ctrl);

      postMessage({ chatWindowId, role: 'user', content }, ctrl.signal)
        .then((result) => {
          if (controllers.current.get(chatWindowId) === ctrl) {
            controllers.current.delete(chatWindowId);
          }
          if (ctrl.signal.aborted) return;
          fulfillSuccess(chatWindowId, tempId, result);
        })
        .catch((err: unknown) => {
          if (controllers.current.get(chatWindowId) === ctrl) {
            controllers.current.delete(chatWindowId);
          }
          if (ctrl.signal.aborted) {
            const code = (err as ApiCallError | null)?.code;
            if (code === 'timeout') {
              fulfillError(chatWindowId, tempId, err);
            } else {
              fulfillError(chatWindowId, tempId, {
                code: 'canceled',
                message: 'Request canceled',
              });
            }
            return;
          }
          fulfillError(chatWindowId, tempId, err);
        });
    },
    [fulfillSuccess, fulfillError],
  );

  const sendUserMessage = useCallback(
    (chatWindowId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const useApi = !!getApiBaseUrl() && !chatWindowId.startsWith('local-');
      const tempId = nextTempId(chatWindowId);
      const now = new Date().toISOString();
      const optimistic: MockMessage = {
        id: tempId,
        chatWindowId,
        role: 'user',
        content: trimmed,
        createdAt: now,
        status: useApi ? 'pending' : 'ok',
        clientTempId: tempId,
      };
      setSessions((prev) => {
        const current = prev[chatWindowId] ?? { messages: [], pendingTempId: null };
        return {
          ...prev,
          [chatWindowId]: {
            messages: [...current.messages, optimistic],
            pendingTempId: useApi ? tempId : current.pendingTempId,
          },
        };
      });
      if (useApi) dispatchPost(chatWindowId, tempId, trimmed);
    },
    [dispatchPost],
  );

  const retry = useCallback(
    (chatWindowId: string, clientTempId: string) => {
      const target = sessionsRef.current[chatWindowId]?.messages.find(
        (m) => m.clientTempId === clientTempId,
      );
      if (!target || target.status !== 'failed') return;
      setSessions((prev) => {
        const current = prev[chatWindowId];
        if (!current) return prev;
        return {
          ...prev,
          [chatWindowId]: {
            messages: current.messages.map((m) =>
              m.clientTempId === clientTempId
                ? { ...m, status: 'pending', errorCode: undefined, errorMessage: undefined }
                : m,
            ),
            pendingTempId: clientTempId,
          },
        };
      });
      dispatchPost(chatWindowId, clientTempId, target.content);
    },
    [dispatchPost],
  );

  const cancel = useCallback((chatWindowId: string) => {
    controllers.current.get(chatWindowId)?.abort();
  }, []);

  return { getMessages, isPending, sendUserMessage, retry, cancel };
}
