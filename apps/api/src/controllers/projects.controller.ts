import type { Project } from '@webapp/types';
import {
  isRecord,
  readBody,
  respond,
  respondCreated,
  respondError,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { createProject, listProjects } from '../services/projects.service.js';

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

  const project: Project = createProject(
    body.name.trim(),
    typeof body.description === 'string' ? body.description : undefined,
  );
  return respondCreated(project);
}
