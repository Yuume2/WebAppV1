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

export type ApiErrorCode =
  | 'invalid_json'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'unauthenticated'
  | 'method_not_allowed'
  | 'internal_error';

export interface ApiError {
  code: ApiErrorCode;
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

// ── Canonical API route contract ─────────────────────────────────────────────

export const API_HEALTH_PATH       = '/health' as const;
export const API_PROJECTS_PATH     = '/v1/projects' as const;
export const API_WORKSPACES_PATH   = '/v1/workspaces' as const;
export const API_CHAT_WINDOWS_PATH = '/v1/chat-windows' as const;
export const API_MESSAGES_PATH     = '/v1/messages' as const;
export const API_STATE_PATH        = '/v1/state' as const;
export const API_AUTH_SIGNUP_PATH  = '/v1/auth/signup' as const;
export const API_AUTH_LOGIN_PATH   = '/v1/auth/login' as const;
export const API_AUTH_LOGOUT_PATH  = '/v1/auth/logout' as const;
export const API_AUTH_ME_PATH      = '/v1/auth/me' as const;

export interface SafeUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export const getProjectPath     = (id: string): string => `${API_PROJECTS_PATH}/${id}`;
export const getWorkspacePath   = (id: string): string => `${API_WORKSPACES_PATH}/${id}`;
export const getChatWindowPath  = (id: string): string => `${API_CHAT_WINDOWS_PATH}/${id}`;
export const getMessagePath     = (id: string): string => `${API_MESSAGES_PATH}/${id}`;
