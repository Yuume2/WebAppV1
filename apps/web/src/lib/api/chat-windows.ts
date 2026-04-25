import type { AIProvider, ChatWindow } from '@webapp/types';
import { API_CHAT_WINDOWS_PATH } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';
import { deleteJson, patchJson, postJson } from '@/lib/api/http';

export interface FetchOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function fetchWorkspaceWindows(
  workspaceId: string,
  options?: FetchOptions,
): Promise<ChatWindow[]> {
  const encoded = encodeURIComponent(workspaceId);
  return apiFetch<ChatWindow[]>(
    `${API_CHAT_WINDOWS_PATH}?workspaceId=${encoded}`,
    options,
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

export interface PatchChatWindowInput {
  title?: string;
}

export function patchChatWindow(
  id: string,
  input: PatchChatWindowInput,
  signal?: AbortSignal,
): Promise<ChatWindow> {
  const encoded = encodeURIComponent(id);
  return patchJson<ChatWindow>(`${API_CHAT_WINDOWS_PATH}/${encoded}`, input, signal);
}

export function deleteChatWindow(id: string, signal?: AbortSignal): Promise<null> {
  const encoded = encodeURIComponent(id);
  return deleteJson<null>(`${API_CHAT_WINDOWS_PATH}/${encoded}`, signal);
}
