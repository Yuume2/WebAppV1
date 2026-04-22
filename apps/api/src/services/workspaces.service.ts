import type { Workspace } from '@webapp/types';

const seededAt = '2026-04-18T00:00:00.000Z';

const store: readonly Workspace[] = Object.freeze([
  Object.freeze({
    id: 'ws-1',
    projectId: 'proj-1',
    name: 'Main Canvas',
    windowIds: Object.freeze(['win-1', 'win-2', 'win-3']) as unknown as string[],
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'ws-1b',
    projectId: 'proj-1',
    name: 'Deep Dive',
    windowIds: Object.freeze(['win-6', 'win-7']) as unknown as string[],
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'ws-2',
    projectId: 'proj-2',
    name: 'Draft Canvas',
    windowIds: Object.freeze(['win-4', 'win-5']) as unknown as string[],
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
]);

export function listWorkspacesByProjectId(projectId: string): Workspace[] {
  return store
    .filter((w) => w.projectId === projectId)
    .map((w) => ({ ...w, windowIds: [...w.windowIds] }));
}

export function workspaceExists(workspaceId: string): boolean {
  return store.some((w) => w.id === workspaceId);
}
