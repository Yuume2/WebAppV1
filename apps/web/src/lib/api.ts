import type {
  ApiResponse,
  AppState,
  Project,
  Workspace,
  ChatWindow,
  Message,
  CreateProjectInput,
  CreateWorkspaceInput,
  CreateChatWindowInput,
  CreateMessageInput,
} from '@webapp/types';
import {
  API_STATE_PATH,
  API_PROJECTS_PATH,
  API_WORKSPACES_PATH,
  API_CHAT_WINDOWS_PATH,
  API_MESSAGES_PATH,
} from '@webapp/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const fetchState = (): Promise<AppState> => apiFetch<AppState>(API_STATE_PATH);

export const createProject = (input: CreateProjectInput): Promise<Project> =>
  post<Project>(API_PROJECTS_PATH, input);

export const createWorkspace = (input: CreateWorkspaceInput): Promise<Workspace> =>
  post<Workspace>(API_WORKSPACES_PATH, input);

export const createChatWindow = (input: CreateChatWindowInput): Promise<ChatWindow> =>
  post<ChatWindow>(API_CHAT_WINDOWS_PATH, input);

export const createMessage = (input: CreateMessageInput): Promise<Message> =>
  post<Message>(API_MESSAGES_PATH, input);

export const devSeed  = (): Promise<unknown> => post('/v1/dev/seed',  {});
export const devReset = (): Promise<unknown> => post('/v1/dev/reset', {});
