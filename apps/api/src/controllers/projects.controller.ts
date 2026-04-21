import type { ApiResponse, Project } from '@webapp/types';
import { HttpError, ok } from '../lib/http.js';
import type { RequestContext } from '../lib/http.js';
import { getProjectById, listProjects } from '../services/projects.service.js';

export function listProjectsController(_ctx: RequestContext): ApiResponse<Project[]> {
  return ok(listProjects());
}

export function getProjectController(ctx: RequestContext): ApiResponse<Project> {
  const id = ctx.params.id;
  if (!id) throw HttpError.notFound(`No project with id ""`);
  const project = getProjectById(id);
  if (!project) throw HttpError.notFound(`No project with id "${id}"`);
  return ok(project);
}
