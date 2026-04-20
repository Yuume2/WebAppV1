import { healthController } from '../controllers/health.controller.js';
import { createChatWindowController, getChatWindowController, listChatWindowsController } from '../controllers/chat-windows.controller.js';
import { createMessageController, getMessageController, listMessagesController } from '../controllers/messages.controller.js';
import { createProjectController, getProjectController, listProjectsController } from '../controllers/projects.controller.js';
import { stateController } from '../controllers/state.controller.js';
import { createWorkspaceController, getWorkspaceController, listWorkspacesController } from '../controllers/workspaces.controller.js';
import { env } from '../config/env.js';
import type { RouteDefinition } from '../lib/http.js';
import { devRoutes } from './dev.js';

const businessRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/health', handler: healthController },

  { method: 'GET',  path: '/v1/projects',          handler: listProjectsController },
  { method: 'POST', path: '/v1/projects',          handler: createProjectController },
  { method: 'GET',  path: '/v1/projects/:id',      handler: getProjectController },

  { method: 'GET',  path: '/v1/workspaces',        handler: listWorkspacesController },
  { method: 'POST', path: '/v1/workspaces',        handler: createWorkspaceController },
  { method: 'GET',  path: '/v1/workspaces/:id',    handler: getWorkspaceController },

  { method: 'GET',  path: '/v1/chat-windows',      handler: listChatWindowsController },
  { method: 'POST', path: '/v1/chat-windows',      handler: createChatWindowController },
  { method: 'GET',  path: '/v1/chat-windows/:id',  handler: getChatWindowController },

  { method: 'GET',  path: '/v1/messages',          handler: listMessagesController },
  { method: 'POST', path: '/v1/messages',          handler: createMessageController },
  { method: 'GET',  path: '/v1/messages/:id',      handler: getMessageController },

  { method: 'GET',  path: '/v1/state',             handler: stateController },
];

export const routes: RouteDefinition[] = [
  ...businessRoutes,
  ...(env.nodeEnv !== 'production' ? devRoutes : []),
];
