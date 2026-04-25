import type { Workspace } from '@webapp/types';
import { API_WORKSPACES_PATH } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';
import { deleteJson, patchJson, postJson } from '@/lib/api/http';

export interface FetchOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function fetchProjectWorkspaces(
  projectId: string,
  options?: FetchOptions,
): Promise<Workspace[]> {
  const encoded = encodeURIComponent(projectId);
  return apiFetch<Workspace[]>(`${API_WORKSPACES_PATH}?projectId=${encoded}`, options);
}

export interface CreateWorkspaceInput {
  projectId: string;
  name: string;
}

export function createWorkspace(
  input: CreateWorkspaceInput,
  signal?: AbortSignal,
): Promise<Workspace> {
  return postJson<Workspace>('/v1/workspaces', input, signal);
}

export interface PatchWorkspaceInput {
  name?: string;
}

export function patchWorkspace(
  id: string,
  input: PatchWorkspaceInput,
  signal?: AbortSignal,
): Promise<Workspace> {
  const encoded = encodeURIComponent(id);
  return patchJson<Workspace>(`${API_WORKSPACES_PATH}/${encoded}`, input, signal);
}

export function deleteWorkspace(id: string, signal?: AbortSignal): Promise<null> {
  const encoded = encodeURIComponent(id);
  return deleteJson<null>(`${API_WORKSPACES_PATH}/${encoded}`, signal);
}
