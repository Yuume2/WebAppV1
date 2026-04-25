import type { Workspace } from '@webapp/types';
import { getWorkspacePath } from '@webapp/types';
import {
  parseJsonBody,
  respond,
  respondCreated,
  respondError,
  respondNoContent,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { s } from '../lib/schema.js';
import { projectExists } from '../services/projects.service.js';
import {
  createWorkspace,
  deleteWorkspace,
  findWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '../services/workspaces.service.js';

const CreateWorkspaceBody = s.object({
  projectId: s.string({ min: 1 }),
  name:      s.string({ min: 1, max: 200, trim: true }),
});

const PatchWorkspaceBody = s.object({
  name: s.optional(s.string({ min: 1, max: 200, trim: true })),
});

export function listWorkspacesController(ctx: RequestContext): InternalResult {
  const projectId = ctx.url.searchParams.get('projectId');
  if (!projectId) {
    return respondError('validation_error', 'Query param projectId is required');
  }
  return respond(listWorkspaces(projectId));
}

export async function createWorkspaceController(ctx: RequestContext): Promise<InternalResult> {
  const body = await parseJsonBody(ctx, CreateWorkspaceBody);
  if (!body.ok) return body.result;

  if (!projectExists(body.value.projectId)) {
    return respondNotFound(`Project ${body.value.projectId} not found`);
  }

  const ws: Workspace = createWorkspace(body.value.projectId, body.value.name);
  return respondCreated(ws, getWorkspacePath(ws.id));
}

export function getWorkspaceController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const ws = findWorkspace(id);
  return ws ? respond(ws) : respondNotFound(`Workspace ${id} not found`);
}

export async function patchWorkspaceController(ctx: RequestContext): Promise<InternalResult> {
  const body = await parseJsonBody(ctx, PatchWorkspaceBody);
  if (!body.ok) return body.result;

  const id = ctx.params['id'] ?? '';
  const updated = updateWorkspace(id, body.value);
  return updated ? respond(updated) : respondNotFound(`Workspace ${id} not found`);
}

export function deleteWorkspaceController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  return deleteWorkspace(id) ? respondNoContent() : respondNotFound(`Workspace ${id} not found`);
}
