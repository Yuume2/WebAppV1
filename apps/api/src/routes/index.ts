import { healthController } from '../controllers/health.controller.js';
import { createChatWindowController, getChatWindowController, listChatWindowsController } from '../controllers/chat-windows.controller.js';
import { createMessageController, getMessageController, listMessagesController } from '../controllers/messages.controller.js';
import { createProjectController, getProjectController, listProjectsController } from '../controllers/projects.controller.js';
import { stateController } from '../controllers/state.controller.js';
import { createWorkspaceController, getWorkspaceController, listWorkspacesController } from '../controllers/workspaces.controller.js';
import { makeAuthDeps } from '../controllers/auth.controller.js';
import { createDb } from '../lib/db.js';
import { env } from '../config/env.js';
import type { RouteDefinition } from '../lib/http.js';
import { devRoutes } from './dev.js';
import { makeAuthRoutes } from './auth.js';
import {
  API_HEALTH_PATH,
  API_PROJECTS_PATH,
  API_WORKSPACES_PATH,
  API_CHAT_WINDOWS_PATH,
  API_MESSAGES_PATH,
  API_STATE_PATH,
} from '@webapp/types';

export const businessRoutes: RouteDefinition[] = [
  { method: 'GET', path: API_HEALTH_PATH, handler: healthController },

  { method: 'GET',  path: API_PROJECTS_PATH,           handler: listProjectsController },
  { method: 'POST', path: API_PROJECTS_PATH,           handler: createProjectController },
  { method: 'GET',  path: `${API_PROJECTS_PATH}/:id`,  handler: getProjectController },

  { method: 'GET',  path: API_WORKSPACES_PATH,            handler: listWorkspacesController },
  { method: 'POST', path: API_WORKSPACES_PATH,            handler: createWorkspaceController },
  { method: 'GET',  path: `${API_WORKSPACES_PATH}/:id`,   handler: getWorkspaceController },

  { method: 'GET',  path: API_CHAT_WINDOWS_PATH,            handler: listChatWindowsController },
  { method: 'POST', path: API_CHAT_WINDOWS_PATH,            handler: createChatWindowController },
  { method: 'GET',  path: `${API_CHAT_WINDOWS_PATH}/:id`,   handler: getChatWindowController },

  { method: 'GET',  path: API_MESSAGES_PATH,           handler: listMessagesController },
  { method: 'POST', path: API_MESSAGES_PATH,           handler: createMessageController },
  { method: 'GET',  path: `${API_MESSAGES_PATH}/:id`,  handler: getMessageController },

  { method: 'GET',  path: API_STATE_PATH, handler: stateController },
];

// Auth routes are only registered when DATABASE_URL is configured.
// Without it they are simply absent (existing tests are unaffected).
const authRoutes: RouteDefinition[] = env.databaseUrl
  ? makeAuthRoutes(makeAuthDeps(createDb()))
  : [];

export const routes: RouteDefinition[] = [
  ...businessRoutes,
  ...authRoutes,
  ...(env.enableDevEndpoints ? devRoutes : []),
];
