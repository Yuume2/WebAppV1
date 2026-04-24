import type { Workspace } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';
import { postJson } from '@/lib/api/http';

export function fetchProjectWorkspaces(
  projectId: string,
  signal?: AbortSignal,
): Promise<Workspace[]> {
  const encoded = encodeURIComponent(projectId);
  return apiFetch<Workspace[]>(
    `/v1/projects/${encoded}/workspaces`,
    signal ? { signal } : undefined,
  );
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
