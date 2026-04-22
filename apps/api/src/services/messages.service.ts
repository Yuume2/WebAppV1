import type { Message } from '@webapp/types';

const seededAt = '2026-04-18T00:00:00.000Z';

const store: readonly Message[] = Object.freeze([
  Object.freeze({
    id: 'm-1',
    windowId: 'win-1',
    role: 'user',
    content: 'Summarize the latest AI tooling market trends.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-2',
    windowId: 'win-1',
    role: 'assistant',
    content: 'Three dominant trends: agent orchestration, multi-model routing, edge inference.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-3',
    windowId: 'win-2',
    role: 'user',
    content: 'Who are the top 5 competitors in this space?',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-4',
    windowId: 'win-2',
    role: 'assistant',
    content: 'Anthropic, OpenAI, Google DeepMind, Mistral, Cohere.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-5',
    windowId: 'win-3',
    role: 'user',
    content: 'Pull fresh news about model releases this week.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-6',
    windowId: 'win-4',
    role: 'assistant',
    content: 'Here is a three-section outline to start from.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-7',
    windowId: 'win-5',
    role: 'user',
    content: 'Make this paragraph more concise.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-8',
    windowId: 'win-6',
    role: 'user',
    content: 'Map current EU AI Act obligations for high-risk systems.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-9',
    windowId: 'win-6',
    role: 'assistant',
    content: 'Article 9 risk management, Article 10 data governance, Article 13 transparency.',
    createdAt: seededAt,
  }),
  Object.freeze({
    id: 'm-10',
    windowId: 'win-7',
    role: 'user',
    content: 'Find recent patents about RAG infrastructure.',
    createdAt: seededAt,
  }),
]);

export function listMessagesByWindowId(windowId: string): Message[] {
  return store.filter((m) => m.windowId === windowId).map((m) => ({ ...m }));
}
