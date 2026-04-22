import type { ChatWindow } from '@webapp/types';

const seededAt = '2026-04-18T00:00:00.000Z';

const store: readonly ChatWindow[] = Object.freeze([
  Object.freeze({
    id: 'win-1',
    workspaceId: 'ws-1',
    title: 'Market analysis',
    provider: 'openai',
    model: 'gpt-4o',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'win-2',
    workspaceId: 'ws-1',
    title: 'Competitor scan',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'win-3',
    workspaceId: 'ws-1',
    title: 'Live sources',
    provider: 'perplexity',
    model: 'sonar-pro',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'win-4',
    workspaceId: 'ws-2',
    title: 'Outline draft',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'win-5',
    workspaceId: 'ws-2',
    title: 'Tone polish',
    provider: 'openai',
    model: 'gpt-4o-mini',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'win-6',
    workspaceId: 'ws-1b',
    title: 'Regulation deep dive',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
  Object.freeze({
    id: 'win-7',
    workspaceId: 'ws-1b',
    title: 'Patent search',
    provider: 'perplexity',
    model: 'sonar-pro',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
]);

export function listWindowsByWorkspaceId(workspaceId: string): ChatWindow[] {
  return store.filter((w) => w.workspaceId === workspaceId).map((w) => ({ ...w }));
}

export function windowExists(windowId: string): boolean {
  return store.some((w) => w.id === windowId);
}
