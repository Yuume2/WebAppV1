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

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  chatWindowId: string;
  role: MessageRole;
  content: string;
  createdAt: ISODateString;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export interface HealthStatus {
  service: 'webapp-api';
  status: 'ok';
  version: string;
  uptimeSeconds: number;
  timestamp: ISODateString;
}
