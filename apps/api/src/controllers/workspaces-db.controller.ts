import type { IncomingMessage } from 'node:http';
import type { Workspace } from '@webapp/types';
import { getWorkspacePath } from '@webapp/types';
import {
  isRecord,
  readJsonBody,
  respond,
  respondCreated,
  respondError,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import type { Db } from '../db/workspaces.repo.js';
import * as workspacesRepo from '../db/workspaces.repo.js';

// ── Internal DB row shape ──────────────────────────────────────────────────────

interface DbWorkspace {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Deps ──────────────────────────────────────────────────────────────────────

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

export interface WorkspacesDeps {
  resolveUser: (req: IncomingMessage) => Promise<{ id: string } | null>;
  listWorkspaces: (projectId: string, userId: string) => Promise<DbWorkspace[] | null>;
  createWorkspace: (projectId: string, userId: string, name: string) => Promise<DbWorkspace | null>;
  findWorkspace: (id: string, userId: string) => Promise<DbWorkspace | null>;
}

export function makeWorkspacesDeps(db: Db, sessionDeps: SessionDeps): WorkspacesDeps {
  return {
    resolveUser:     (req)                       => resolveCurrentUser(req, sessionDeps),
    listWorkspaces:  (projectId, userId)         => workspacesRepo.listWorkspacesByProjectAndUser(db, projectId, userId),
    createWorkspace: (projectId, userId, name)   => workspacesRepo.createWorkspace(db, projectId, userId, name),
    findWorkspace:   (id, userId)                => workspacesRepo.findWorkspaceById(db, id, userId),
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toWorkspace(row: DbWorkspace): Workspace {
  return {
    id:        row.id,
    projectId: row.projectId,
    name:      row.name,
    windowIds: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function listWorkspacesDbController(
  ctx: RequestContext,
  deps: WorkspacesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const projectId = ctx.url.searchParams.get('projectId') ?? '';
  if (!projectId) return respondError('validation_error', 'Query param projectId is required');

  const rows = await deps.listWorkspaces(projectId, user.id);
  if (rows === null) return respondNotFound(`Project ${projectId} not found`);
  return respond(rows.map(toWorkspace));
}

export async function createWorkspaceDbController(
  ctx: RequestContext,
  deps: WorkspacesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const bodyResult = await readJsonBody(ctx.req);
  if (!bodyResult.ok) return bodyResult.result;
  const body = bodyResult.data;

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.projectId !== 'string' || !body.projectId) {
    return respondError('validation_error', 'projectId is required');
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return respondError('validation_error', 'name is required and must be a non-empty string');
  }

  const row = await deps.createWorkspace(body.projectId, user.id, body.name.trim());
  if (row === null) return respondNotFound(`Project ${body.projectId} not found`);
  const workspace = toWorkspace(row);
  return respondCreated(workspace, getWorkspacePath(workspace.id));
}

export async function getWorkspaceDbController(
  ctx: RequestContext,
  deps: WorkspacesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const row = await deps.findWorkspace(id, user.id);
  return row ? respond(toWorkspace(row)) : respondNotFound(`Workspace ${id} not found`);
}
