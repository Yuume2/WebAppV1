import type { ChatWindow } from '@webapp/types';
import { API_CHAT_WINDOWS_PATH } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';

export function fetchWorkspaceWindows(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ChatWindow[]> {
  const encoded = encodeURIComponent(workspaceId);
  return apiFetch<ChatWindow[]>(
    `${API_CHAT_WINDOWS_PATH}?workspaceId=${encoded}`,
    signal ? { signal } : undefined,
  );
}
