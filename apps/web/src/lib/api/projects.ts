import type { Project } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';

export function fetchProjects(signal?: AbortSignal): Promise<Project[]> {
  return apiFetch<Project[]>('/v1/projects', signal ? { signal } : undefined);
}

export function fetchProject(id: string, signal?: AbortSignal): Promise<Project> {
  const encoded = encodeURIComponent(id);
  return apiFetch<Project>(`/v1/projects/${encoded}`, signal ? { signal } : undefined);
}
