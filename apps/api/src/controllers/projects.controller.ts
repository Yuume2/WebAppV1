import type { ApiResponse, Project } from '@webapp/types';
import { ok } from '../lib/http.js';
import type { RequestContext } from '../lib/http.js';
import { listProjects } from '../services/projects.service.js';

export function listProjectsController(_ctx: RequestContext): ApiResponse<Project[]> {
  return ok(listProjects());
}
