import type { AIProvider } from '@webapp/types';

export interface WindowPreset {
  id: string;
  provider: AIProvider;
  model: string;
  defaultTitle: string;
  description: string;
}

export const WINDOW_PRESETS: WindowPreset[] = [
  {
    id: 'anthropic-opus',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    defaultTitle: 'Reasoning thread',
    description: 'Long-form reasoning, deep analysis.',
  },
  {
    id: 'anthropic-sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    defaultTitle: 'Drafting thread',
    description: 'Fast drafting and refinement.',
  },
  {
    id: 'openai-gpt4o',
    provider: 'openai',
    model: 'gpt-4o',
    defaultTitle: 'General assistant',
    description: 'General-purpose conversation.',
  },
  {
    id: 'perplexity-sonar',
    provider: 'perplexity',
    model: 'sonar-pro',
    defaultTitle: 'Live search',
    description: 'Up-to-date sources and citations.',
  },
];

export function getPreset(id: string): WindowPreset | null {
  return WINDOW_PRESETS.find((p) => p.id === id) ?? null;
}
