export type ISODateString = string;

export type AIProvider = 'openai' | 'anthropic' | 'perplexity';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Workspace {
  id: string;
  projectId: string;
  name: string;
  windowIds: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ChatWindow {
  id: string;
  workspaceId: string;
  title: string;
  provider: AIProvider;
  model: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
