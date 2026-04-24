import type { GeneratedMessagePair, Message, MessageRole } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';
import { postJson } from '@/lib/api/http';

export function fetchWindowMessages(
  chatWindowId: string,
  signal?: AbortSignal,
): Promise<Message[]> {
  const encoded = encodeURIComponent(chatWindowId);
  return apiFetch<Message[]>(
    `/v1/windows/${encoded}/messages`,
    signal ? { signal } : undefined,
  );
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
