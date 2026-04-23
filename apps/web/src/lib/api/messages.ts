import type { Message } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';

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
