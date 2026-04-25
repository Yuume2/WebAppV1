import type { Project } from '@webapp/types';
import { apiFetch } from '@/lib/api/client';
import { postJson } from '@/lib/api/http';

export interface FetchOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function fetchProjects(options?: FetchOptions): Promise<Project[]> {
  return apiFetch<Project[]>('/v1/projects', options);
}

export function fetchProject(id: string, options?: FetchOptions): Promise<Project> {
  const encoded = encodeURIComponent(id);
  return apiFetch<Project>(`/v1/projects/${encoded}`, options);
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export function createProject(input: CreateProjectInput, signal?: AbortSignal): Promise<Project> {
  return postJson<Project>('/v1/projects', input, signal);
}
