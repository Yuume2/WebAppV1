import { randomUUID } from 'node:crypto';
import type { Workspace } from '@webapp/types';

let store: Workspace[] = [];

export function listWorkspaces(projectId: string): Workspace[] {
  return store
    .filter((w) => w.projectId === projectId)
    .map((w) => ({ ...w, windowIds: [...w.windowIds] }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function createWorkspace(projectId: string, name: string): Workspace {
  const now = new Date().toISOString();
  const ws: Workspace = { id: randomUUID(), projectId, name, windowIds: [], createdAt: now, updatedAt: now };
  store.push(ws);
  return { ...ws, windowIds: [] };
}

export function findWorkspace(id: string): Workspace | undefined {
  const w = store.find((w) => w.id === id);
  return w ? { ...w, windowIds: [...w.windowIds] } : undefined;
}

export function workspaceExists(id: string): boolean {
  return store.some((w) => w.id === id);
}

export function appendWindowId(workspaceId: string, windowId: string): void {
  const ws = store.find((w) => w.id === workspaceId);
  if (ws) ws.windowIds.push(windowId);
}

export function updateWorkspace(id: string, patch: { name?: string }): Workspace | undefined {
  const ws = store.find((w) => w.id === id);
  if (!ws) return undefined;
  if (patch.name !== undefined) ws.name = patch.name;
  ws.updatedAt = new Date().toISOString();
  return { ...ws, windowIds: [...ws.windowIds] };
}

export function deleteWorkspace(id: string): boolean {
  const i = store.findIndex((w) => w.id === id);
  if (i === -1) return false;
  store.splice(i, 1);
  return true;
}

export function resetWorkspacesStore(): void {
  store = [];
}

export function insertWorkspaceRaw(workspace: Workspace): void {
  store.push(workspace);
}
