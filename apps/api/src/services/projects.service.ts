import type { Project } from '@webapp/types';

const seededAt = '2026-04-18T00:00:00.000Z';

const store: readonly Project[] = Object.freeze([
  Object.freeze({
    id: 'proj-1',
    name: 'Research Sprint',
    description: 'Multi-provider research workspace',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'proj-2',
    name: 'Content Pipeline',
    description: 'Drafting and refining content with multiple models',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
]);

export function listProjects(): Project[] {
  return store.map((p) => ({ ...p }));
}
