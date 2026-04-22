import type { Workspace } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';

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
