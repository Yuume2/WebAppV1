import type { ChatWindow, MessageRole, Project, Workspace } from '@webapp/types';

export interface MockMessage {
  id: string;
  chatWindowId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

const now = '2026-04-18T00:00:00.000Z';

export const projects: Project[] = [
  {
    id: 'proj-1',
    name: 'Research Sprint',
    description: 'Multi-provider research workspace',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'proj-2',
    name: 'Content Pipeline',
    description: 'Drafting and refining content with multiple models',
    createdAt: now,
    updatedAt: now,
  },
];

export const workspaces: Workspace[] = [
  {
    id: 'ws-1',
    projectId: 'proj-1',
    name: 'Main Canvas',
    windowIds: ['win-1', 'win-2', 'win-3'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'ws-1b',
    projectId: 'proj-1',
    name: 'Deep Dive',
    windowIds: ['win-6', 'win-7'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'ws-2',
    projectId: 'proj-2',
    name: 'Draft Canvas',
    windowIds: ['win-4', 'win-5'],
    createdAt: now,
    updatedAt: now,
  },
];

export const windows: ChatWindow[] = [
  {
    id: 'win-1',
    workspaceId: 'ws-1',
    title: 'Market analysis',
    provider: 'openai',
    model: 'gpt-4o',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'win-2',
    workspaceId: 'ws-1',
    title: 'Competitor scan',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'win-3',
    workspaceId: 'ws-1',
    title: 'Live sources',
    provider: 'perplexity',
    model: 'sonar-pro',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'win-4',
    workspaceId: 'ws-2',
    title: 'Outline draft',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'win-5',
    workspaceId: 'ws-2',
    title: 'Tone polish',
    provider: 'openai',
    model: 'gpt-4o-mini',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'win-6',
    workspaceId: 'ws-1b',
    title: 'Regulation deep dive',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'win-7',
    workspaceId: 'ws-1b',
    title: 'Patent search',
    provider: 'perplexity',
    model: 'sonar-pro',
    createdAt: now,
    updatedAt: now,
  },
];

export const messages: MockMessage[] = [
  {
    id: 'm-1',
    chatWindowId: 'win-1',
    role: 'user',
    content: 'Summarize the latest AI tooling market trends.',
    createdAt: now,
  },
  {
    id: 'm-2',
    chatWindowId: 'win-1',
    role: 'assistant',
    content: 'Three dominant trends: agent orchestration, multi-model routing, edge inference.',
    createdAt: now,
  },
  {
    id: 'm-3',
    chatWindowId: 'win-2',
    role: 'user',
    content: 'Who are the top 5 competitors in this space?',
    createdAt: now,
  },
  {
    id: 'm-4',
    chatWindowId: 'win-2',
    role: 'assistant',
    content: 'Anthropic, OpenAI, Google DeepMind, Mistral, Cohere.',
    createdAt: now,
  },
  {
    id: 'm-5',
    chatWindowId: 'win-3',
    role: 'user',
    content: 'Pull fresh news about model releases this week.',
    createdAt: now,
  },
  {
    id: 'm-6',
    chatWindowId: 'win-4',
    role: 'assistant',
    content: 'Here is a three-section outline to start from.',
    createdAt: now,
  },
  {
    id: 'm-7',
    chatWindowId: 'win-5',
    role: 'user',
    content: 'Make this paragraph more concise.',
    createdAt: now,
  },
  {
    id: 'm-8',
    chatWindowId: 'win-6',
    role: 'user',
    content: 'Map current EU AI Act obligations for high-risk systems.',
    createdAt: now,
  },
  {
    id: 'm-9',
    chatWindowId: 'win-6',
    role: 'assistant',
    content: 'Article 9 risk management, Article 10 data governance, Article 13 transparency.',
    createdAt: now,
  },
  {
    id: 'm-10',
    chatWindowId: 'win-7',
    role: 'user',
    content: 'Find recent patents about RAG infrastructure.',
    createdAt: now,
  },
];
