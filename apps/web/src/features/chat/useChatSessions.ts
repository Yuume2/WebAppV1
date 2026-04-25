'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MockMessage } from '@/lib/data';
import { getApiBaseUrl } from '@/lib/api/env';
import {
  isGeneratedPair,
  postMessage,
  streamMessage,
  type PostMessageResult,
} from '@/lib/api/messages';
import type { Message } from '@webapp/types';
import type { ApiCallError } from '@/lib/api/client';

export interface ChatSessionsApi {
  getMessages: (chatWindowId: string) => MockMessage[];
  isPending: (chatWindowId: string) => boolean;
  sendUserMessage: (chatWindowId: string, content: string) => void;
  retry: (chatWindowId: string, clientTempId: string) => void;
  cancel: (chatWindowId: string) => void;
}

export interface UseChatSessionsOptions {
  onError?: (chatWindowId: string, error: ApiCallError) => void;
  stream?: boolean;
}

let streamTempCounter = 0;
function nextStreamAssistantId(chatWindowId: string): string {
  streamTempCounter += 1;
  return `tmp-asst-${chatWindowId}-${Date.now()}-${streamTempCounter}`;
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

export function useChatSessions(
  initial: Record<string, MockMessage[]>,
  options?: UseChatSessionsOptions,
): ChatSessionsApi {
  const [sessions, setSessions] = useState<Sessions>(() => toSessions(initial));
  const controllers = useRef<Map<string, AbortController>>(new Map());
  const sessionsRef = useRef<Sessions>(sessions);
  sessionsRef.current = sessions;
  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;
  const streamRef = useRef(options?.stream === true);
  streamRef.current = options?.stream === true;

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
      if (e.code !== 'canceled') onErrorRef.current?.(chatWindowId, e);
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

  const seedStreamingAssistant = useCallback(
    (chatWindowId: string, assistantTempId: string) => {
      const now = new Date().toISOString();
      setSessions((prev) => {
        const current = prev[chatWindowId];
        if (!current) return prev;
        const placeholder: MockMessage = {
          id: assistantTempId,
          chatWindowId,
          role: 'assistant',
          content: '',
          createdAt: now,
          status: 'streaming',
          clientTempId: assistantTempId,
        };
        return {
          ...prev,
          [chatWindowId]: { ...current, messages: [...current.messages, placeholder] },
        };
      });
    },
    [],
  );

  const appendStreamDelta = useCallback(
    (chatWindowId: string, assistantTempId: string, delta: string) => {
      setSessions((prev) => {
        const current = prev[chatWindowId];
        if (!current) return prev;
        return {
          ...prev,
          [chatWindowId]: {
            ...current,
            messages: current.messages.map((m) =>
              m.clientTempId === assistantTempId
                ? { ...m, content: m.content + delta }
                : m,
            ),
          },
        };
      });
    },
    [],
  );

  const finalizeStream = useCallback(
    (
      chatWindowId: string,
      userTempId: string,
      assistantTempId: string,
      userRow: Message | null,
      assistantRow: Message | null,
    ) => {
      setSessions((prev) => {
        const current = prev[chatWindowId];
        if (!current) return prev;
        const messages = current.messages
          .map((m) => {
            if (m.clientTempId === userTempId) {
              if (userRow) {
                return {
                  id: userRow.id,
                  chatWindowId: userRow.chatWindowId,
                  role: userRow.role,
                  content: userRow.content,
                  createdAt: userRow.createdAt,
                  status: 'ok' as const,
                };
              }
              return { ...m, status: 'ok' as const };
            }
            if (m.clientTempId === assistantTempId) {
              if (assistantRow) {
                return {
                  id: assistantRow.id,
                  chatWindowId: assistantRow.chatWindowId,
                  role: assistantRow.role,
                  content: assistantRow.content,
                  createdAt: assistantRow.createdAt,
                  provider: assistantRow.provider ?? undefined,
                  model: assistantRow.model ?? undefined,
                  status: 'ok' as const,
                };
              }
              return { ...m, status: 'ok' as const };
            }
            return m;
          });
        return {
          ...prev,
          [chatWindowId]: {
            messages,
            pendingTempId: current.pendingTempId === userTempId ? null : current.pendingTempId,
          },
        };
      });
    },
    [],
  );

  const dropStreamingPlaceholder = useCallback(
    (chatWindowId: string, assistantTempId: string) => {
      setSessions((prev) => {
        const current = prev[chatWindowId];
        if (!current) return prev;
        return {
          ...prev,
          [chatWindowId]: {
            ...current,
            messages: current.messages.filter((m) => m.clientTempId !== assistantTempId),
          },
        };
      });
    },
    [],
  );

  const dispatchStream = useCallback(
    (chatWindowId: string, tempId: string, content: string) => {
      const ctrl = new AbortController();
      controllers.current.get(chatWindowId)?.abort();
      controllers.current.set(chatWindowId, ctrl);

      const assistantTempId = nextStreamAssistantId(chatWindowId);
      seedStreamingAssistant(chatWindowId, assistantTempId);

      let userRow: Message | null = null;
      let assistantRow: Message | null = null;

      streamMessage(
        { chatWindowId, role: 'user', content },
        {
          onUserMessage: (m) => {
            userRow = m;
          },
          onDelta: (d) => appendStreamDelta(chatWindowId, assistantTempId, d),
          onDone: (m) => {
            assistantRow = m;
          },
        },
        ctrl.signal,
      )
        .then(() => {
          if (controllers.current.get(chatWindowId) === ctrl) {
            controllers.current.delete(chatWindowId);
          }
          if (ctrl.signal.aborted) return;
          finalizeStream(chatWindowId, tempId, assistantTempId, userRow, assistantRow);
        })
        .catch((err: unknown) => {
          if (controllers.current.get(chatWindowId) === ctrl) {
            controllers.current.delete(chatWindowId);
          }
          dropStreamingPlaceholder(chatWindowId, assistantTempId);
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
    [
      seedStreamingAssistant,
      appendStreamDelta,
      finalizeStream,
      dropStreamingPlaceholder,
      fulfillError,
    ],
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
      if (useApi) {
        if (streamRef.current) dispatchStream(chatWindowId, tempId, trimmed);
        else dispatchPost(chatWindowId, tempId, trimmed);
      }
    },
    [dispatchPost, dispatchStream],
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
      if (streamRef.current) dispatchStream(chatWindowId, clientTempId, target.content);
      else dispatchPost(chatWindowId, clientTempId, target.content);
    },
    [dispatchPost, dispatchStream],
  );

  const cancel = useCallback((chatWindowId: string) => {
    controllers.current.get(chatWindowId)?.abort();
  }, []);

  return { getMessages, isPending, sendUserMessage, retry, cancel };
}
