import type { CreateProjectInput, Project } from '@webapp/types';
import {
  isRecord,
  readBody,
  respond,
  respondCreated,
  respondError,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { createProject, findProject, listProjects } from '../services/projects.service.js';

export function listProjectsController(_ctx: RequestContext): InternalResult {
  return respond(listProjects());
}

export async function createProjectController(ctx: RequestContext): Promise<InternalResult> {
  let body: unknown;
  try {
    body = await readBody(ctx.req);
  } catch {
    return respondError('invalid_json', 'Request body must be valid JSON');
  }

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return respondError('validation_error', 'name is required and must be a non-empty string');
  }

  const input = body as unknown as CreateProjectInput;
  const project: Project = createProject(input.name.trim(), input.description);
  return respondCreated(project);
}

export function getProjectController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const project = findProject(id);
  return project ? respond(project) : respondNotFound(`Project ${id} not found`);
}
