import type { AIProvider, ChatWindow } from '@webapp/types';
import { API_CHAT_WINDOWS_PATH } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';
import { postJson } from '@/lib/api/http';

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

export interface CreateChatWindowInput {
  workspaceId: string;
  title: string;
  provider: AIProvider;
  model: string;
}

export function createChatWindow(
  input: CreateChatWindowInput,
  signal?: AbortSignal,
): Promise<ChatWindow> {
  return postJson<ChatWindow>(API_CHAT_WINDOWS_PATH, input, signal);
}
