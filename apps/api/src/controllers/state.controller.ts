import type { AppState } from '@webapp/types';
import { respond, type InternalResult, type RequestContext } from '../lib/http.js';
import { listChatWindows } from '../services/chat-windows.service.js';
import { listMessages } from '../services/messages.service.js';
import { listProjects } from '../services/projects.service.js';
import { listWorkspaces } from '../services/workspaces.service.js';

export function stateController(_ctx: RequestContext): InternalResult {
  const projects = listProjects();
  const workspaces = projects.flatMap((p) => listWorkspaces(p.id));
  const chatWindows = workspaces.flatMap((w) => listChatWindows(w.id));
  const messages = chatWindows.flatMap((c) => listMessages(c.id));
  const state: AppState = { projects, workspaces, chatWindows, messages };
  return respond(state);
}
