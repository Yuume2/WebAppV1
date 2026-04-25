import type { RouteDefinition } from '../lib/http.js';
import type { WorkspacesDeps } from '../controllers/workspaces-db.controller.js';
import {
  listWorkspacesDbController,
  createWorkspaceDbController,
  getWorkspaceDbController,
  patchWorkspaceDbController,
  deleteWorkspaceDbController,
} from '../controllers/workspaces-db.controller.js';
import { API_WORKSPACES_PATH } from '@webapp/types';

export function makeWorkspaceDbRoutes(deps: WorkspacesDeps): RouteDefinition[] {
  return [
    { method: 'GET',    path: API_WORKSPACES_PATH,            handler: (ctx) => listWorkspacesDbController(ctx, deps) },
    { method: 'POST',   path: API_WORKSPACES_PATH,            handler: (ctx) => createWorkspaceDbController(ctx, deps) },
    { method: 'GET',    path: `${API_WORKSPACES_PATH}/:id`,   handler: (ctx) => getWorkspaceDbController(ctx, deps) },
    { method: 'PATCH',  path: `${API_WORKSPACES_PATH}/:id`,   handler: (ctx) => patchWorkspaceDbController(ctx, deps) },
    { method: 'DELETE', path: `${API_WORKSPACES_PATH}/:id`,   handler: (ctx) => deleteWorkspaceDbController(ctx, deps) },
  ];
}
