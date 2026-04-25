import type { GeneratedMessagePair, Message, MessageRole } from '@webapp/types';
import { apiFetch, type ApiCallError } from '@/lib/api/client';
import { getApiBaseUrl } from '@/lib/api/env';
import { postJson } from '@/lib/api/http';

export interface FetchMessagesOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function fetchWindowMessages(
  chatWindowId: string,
  options?: FetchMessagesOptions,
): Promise<Message[]> {
  const encoded = encodeURIComponent(chatWindowId);
  return apiFetch<Message[]>(`/v1/windows/${encoded}/messages`, options);
}

export interface PostMessageInput {
  chatWindowId: string;
  role: MessageRole;
  content: string;
}

export type PostMessageResult = Message | GeneratedMessagePair;

export function isGeneratedPair(r: PostMessageResult): r is GeneratedMessagePair {
  return (
    typeof r === 'object' &&
    r !== null &&
    'userMessage' in r &&
    'assistantMessage' in r
  );
}

export function postMessage(
  input: PostMessageInput,
  signal?: AbortSignal,
): Promise<PostMessageResult> {
  return postJson<PostMessageResult>('/v1/messages', input, signal);
}

export interface StreamMessageHandlers {
  onUserMessage?: (message: Message) => void;
  onDelta?: (delta: string) => void;
  onDone?: (assistant: Message | null) => void;
}

function toApiCallError(message: string, init: Partial<ApiCallError> = {}): ApiCallError {
  const err = new Error(message) as ApiCallError;
  if (init.code !== undefined) err.code = init.code;
  if (init.status !== undefined) err.status = init.status;
  if (init.cause !== undefined) err.cause = init.cause;
  return err;
}

export async function streamMessage(
  input: PostMessageInput,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw toApiCallError('NEXT_PUBLIC_API_URL is not configured', { code: 'no_api_url' });

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/messages/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(input),
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
  } catch (err) {
    const aborted = (err as { name?: string } | null)?.name === 'AbortError';
    throw toApiCallError(
      aborted ? 'Stream request aborted' : 'Network error opening stream',
      { code: aborted ? 'canceled' : 'network_error', cause: err },
    );
  }

  if (!res.ok || !res.body) {
    let code = 'stream_error';
    let message = `Stream failed with status ${res.status}`;
    try {
      const text = await res.text();
      const parsed = text ? JSON.parse(text) : null;
      if (parsed && parsed.ok === false && parsed.error) {
        code = String(parsed.error.code ?? code);
        message = String(parsed.error.message ?? message);
      }
    } catch {
      // body wasn't JSON; keep defaults
    }
    throw toApiCallError(message, { code, status: res.status });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = rawEvent
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        if (data === '[DONE]') {
          handlers.onDone?.(null);
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const obj = parsed as Record<string, unknown> | null;
        if (!obj || typeof obj !== 'object') continue;
        if (typeof obj.delta === 'string') {
          handlers.onDelta?.(obj.delta);
          continue;
        }
        if (obj.error && typeof obj.error === 'object') {
          const e = obj.error as Record<string, unknown>;
          throw toApiCallError(String(e.message ?? 'Stream error'), {
            code: String(e.code ?? 'stream_error'),
          });
        }
        if (obj.userMessage && typeof obj.userMessage === 'object') {
          handlers.onUserMessage?.(obj.userMessage as Message);
        }
        if (obj.assistantMessage && typeof obj.assistantMessage === 'object') {
          handlers.onDone?.(obj.assistantMessage as Message);
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  handlers.onDone?.(null);
}
