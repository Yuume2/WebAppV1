import type { ApiResponse, ChatWindow, Workspace } from '@webapp/types';
import { HttpError, ok } from '../lib/http.js';
import type { RequestContext } from '../lib/http.js';
import { getProjectById } from '../services/projects.service.js';
import {
  listWorkspacesByProjectId,
  workspaceExists,
} from '../services/workspaces.service.js';
import { listWindowsByWorkspaceId } from '../services/windows.service.js';

export function listProjectWorkspacesController(
  ctx: RequestContext,
): ApiResponse<Workspace[]> {
  const id = ctx.params.id;
  if (!id) throw HttpError.notFound(`No project with id ""`);
  const project = getProjectById(id);
  if (!project) throw HttpError.notFound(`No project with id "${id}"`);
  return ok(listWorkspacesByProjectId(id));
}

export function listWorkspaceWindowsController(
  ctx: RequestContext,
): ApiResponse<ChatWindow[]> {
  const id = ctx.params.id;
  if (!id) throw HttpError.notFound(`No workspace with id ""`);
  if (!workspaceExists(id)) throw HttpError.notFound(`No workspace with id "${id}"`);
  return ok(listWindowsByWorkspaceId(id));
}
