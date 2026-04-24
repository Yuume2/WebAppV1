import type { Project } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';
import { postJson } from '@/lib/api/http';

export function fetchProjects(signal?: AbortSignal): Promise<Project[]> {
  return apiFetch<Project[]>('/v1/projects', signal ? { signal } : undefined);
}

export function fetchProject(id: string, signal?: AbortSignal): Promise<Project> {
  const encoded = encodeURIComponent(id);
  return apiFetch<Project>(`/v1/projects/${encoded}`, signal ? { signal } : undefined);
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export function createProject(input: CreateProjectInput, signal?: AbortSignal): Promise<Project> {
  return postJson<Project>('/v1/projects', input, signal);
}
