import { healthController } from '../controllers/health.controller.js';
import {
  getProjectController,
  listProjectsController,
} from '../controllers/projects.controller.js';
import {
  listProjectWorkspacesController,
  listWorkspaceWindowsController,
} from '../controllers/workspaces.controller.js';
import { listWindowMessagesController } from '../controllers/messages.controller.js';
import type { RouteDefinition } from '../lib/http.js';

export const routes: RouteDefinition[] = [
  { method: 'GET', path: '/health', handler: healthController },
  { method: 'GET', path: '/v1/health', handler: healthController },
  { method: 'GET', path: '/v1/projects', handler: listProjectsController },
  { method: 'GET', path: '/v1/projects/:id', handler: getProjectController },
  {
    method: 'GET',
    path: '/v1/projects/:id/workspaces',
    handler: listProjectWorkspacesController,
  },
  {
    method: 'GET',
    path: '/v1/workspaces/:id/windows',
    handler: listWorkspaceWindowsController,
  },
  {
    method: 'GET',
    path: '/v1/windows/:id/messages',
    handler: listWindowMessagesController,
  },
];
