import type { Project } from '@webapp/types';
import { getProjectPath } from '@webapp/types';
import {
  parseJsonBody,
  respond,
  respondCreated,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { s } from '../lib/schema.js';
import { createProject, findProject, listProjects } from '../services/projects.service.js';

const CreateProjectBody = s.object({
  name:        s.string({ min: 1, max: 200, trim: true }),
  description: s.optional(s.nullable(s.string({ max: 2000 }))),
});

export function listProjectsController(_ctx: RequestContext): InternalResult {
  return respond(listProjects());
}

export async function createProjectController(ctx: RequestContext): Promise<InternalResult> {
  const body = await parseJsonBody(ctx, CreateProjectBody);
  if (!body.ok) return body.result;

  const project: Project = createProject(body.value.name, body.value.description ?? undefined);
  return respondCreated(project, getProjectPath(project.id));
}

export function getProjectController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const project = findProject(id);
  return project ? respond(project) : respondNotFound(`Project ${id} not found`);
}
