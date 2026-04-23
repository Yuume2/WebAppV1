import type { RouteDefinition } from '../lib/http.js';
import type { ProjectsDeps } from '../controllers/projects-db.controller.js';
import {
  listProjectsDbController,
  createProjectDbController,
  getProjectDbController,
} from '../controllers/projects-db.controller.js';
import { API_PROJECTS_PATH } from '@webapp/types';

export function makeProjectDbRoutes(deps: ProjectsDeps): RouteDefinition[] {
  return [
    { method: 'GET',  path: API_PROJECTS_PATH,          handler: (ctx) => listProjectsDbController(ctx, deps) },
    { method: 'POST', path: API_PROJECTS_PATH,          handler: (ctx) => createProjectDbController(ctx, deps) },
    { method: 'GET',  path: `${API_PROJECTS_PATH}/:id`, handler: (ctx) => getProjectDbController(ctx, deps) },
  ];
}
