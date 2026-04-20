import type { CreateWorkspaceInput, Workspace } from '@webapp/types';
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
import { projectExists } from '../services/projects.service.js';
import { createWorkspace, findWorkspace, listWorkspaces } from '../services/workspaces.service.js';

export function listWorkspacesController(ctx: RequestContext): InternalResult {
  const projectId = ctx.url.searchParams.get('projectId');
  if (!projectId) {
    return respondError('validation_error', 'Query param projectId is required');
  }
  return respond(listWorkspaces(projectId));
}

export async function createWorkspaceController(ctx: RequestContext): Promise<InternalResult> {
  let body: unknown;
  try {
    body = await readBody(ctx.req);
  } catch {
    return respondError('invalid_json', 'Request body must be valid JSON');
  }

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.projectId !== 'string' || !body.projectId) {
    return respondError('validation_error', 'projectId is required');
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return respondError('validation_error', 'name is required and must be a non-empty string');
  }

  const input = body as unknown as CreateWorkspaceInput;

  if (!projectExists(input.projectId)) {
    return respondNotFound(`Project ${input.projectId} not found`);
  }

  const ws: Workspace = createWorkspace(input.projectId, input.name.trim());
  return respondCreated(ws);
}

export function getWorkspaceController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const ws = findWorkspace(id);
  return ws ? respond(ws) : respondNotFound(`Workspace ${id} not found`);
}
