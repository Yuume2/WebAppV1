import { randomUUID } from 'node:crypto';
import type { Project } from '@webapp/types';

const seededAt = '2026-04-18T00:00:00.000Z';

let store: Project[] = [
  { id: 'proj-1', name: 'Research Sprint', description: 'Multi-provider research workspace', createdAt: seededAt, updatedAt: seededAt },
  { id: 'proj-2', name: 'Content Pipeline', description: 'Drafting and refining content with multiple models', createdAt: seededAt, updatedAt: seededAt },
];

export function listProjects(): Project[] {
  return store
    .map((p) => ({ ...p }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function createProject(name: string, description?: string): Project {
  const now = new Date().toISOString();
  const project: Project = { id: randomUUID(), name, description, createdAt: now, updatedAt: now };
  store.push(project);
  return { ...project };
}

export function findProject(id: string): Project | undefined {
  const p = store.find((p) => p.id === id);
  return p ? { ...p } : undefined;
}

export function projectExists(id: string): boolean {
  return store.some((p) => p.id === id);
}

export function updateProject(
  id: string,
  patch: { name?: string; description?: string | null },
): Project | undefined {
  const p = store.find((p) => p.id === id);
  if (!p) return undefined;
  if (patch.name !== undefined) p.name = patch.name;
  if (patch.description !== undefined) p.description = patch.description ?? undefined;
  p.updatedAt = new Date().toISOString();
  return { ...p };
}

export function deleteProject(id: string): boolean {
  const i = store.findIndex((p) => p.id === id);
  if (i === -1) return false;
  store.splice(i, 1);
  return true;
}

export function resetProjectsStore(): void {
  store = [];
}

export function insertProjectRaw(project: Project): void {
  store.push(project);
}
