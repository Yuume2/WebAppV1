import type { ChatWindow } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';

export function fetchWorkspaceWindows(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ChatWindow[]> {
  const encoded = encodeURIComponent(workspaceId);
  return apiFetch<ChatWindow[]>(
    `/v1/workspaces/${encoded}/windows`,
    signal ? { signal } : undefined,
  );
}
