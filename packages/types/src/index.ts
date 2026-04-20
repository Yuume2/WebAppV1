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

// ── POST payload types ───────────────────────────────────────────────────────

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface CreateWorkspaceInput {
  projectId: string;
  name: string;
}

export interface CreateChatWindowInput {
  workspaceId: string;
  title: string;
  provider: AIProvider;
  model: string;
}

export interface CreateMessageInput {
  chatWindowId: string;
  role: MessageRole;
  content: string;
}

// ── State snapshot ───────────────────────────────────────────────────────────

export interface AppState {
  projects: Project[];
  workspaces: Workspace[];
  chatWindows: ChatWindow[];
  messages: Message[];
}

// ── Named response aliases ───────────────────────────────────────────────────

export type ProjectResponse        = ApiResponse<Project>;
export type ProjectListResponse    = ApiResponse<Project[]>;
export type WorkspaceResponse      = ApiResponse<Workspace>;
export type WorkspaceListResponse  = ApiResponse<Workspace[]>;
export type ChatWindowResponse     = ApiResponse<ChatWindow>;
export type ChatWindowListResponse = ApiResponse<ChatWindow[]>;
export type MessageResponse        = ApiResponse<Message>;
export type MessageListResponse    = ApiResponse<Message[]>;
export type StateResponse          = ApiResponse<AppState>;
export type ApiErrorResponse       = Extract<ApiResponse<never>, { ok: false }>;
