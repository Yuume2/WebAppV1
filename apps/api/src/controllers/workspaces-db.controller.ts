import type { IncomingMessage } from 'node:http';
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
import { resolveCurrentUser } from '../lib/resolve-user.js';
import type { Db, WorkspacePatch } from '../db/workspaces.repo.js';
import * as workspacesRepo from '../db/workspaces.repo.js';
import { listWindowIdsByWorkspaceIds } from '../db/chat-windows.repo.js';

const CreateWorkspaceDbBody = s.object({
  projectId: s.string({ min: 1 }),
  name:      s.string({ min: 1, max: 200, trim: true }),
});

const PatchWorkspaceDbBody = s.object({
  name: s.optional(s.string({ min: 1, max: 200, trim: true })),
});

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
  updateWorkspace: (id: string, userId: string, patch: WorkspacePatch) => Promise<DbWorkspace | null>;
  deleteWorkspace: (id: string, userId: string) => Promise<boolean>;
  listWindowIds: (workspaceIds: string[]) => Promise<Array<{ id: string; workspaceId: string }>>;
}

export function makeWorkspacesDeps(db: Db, sessionDeps: SessionDeps): WorkspacesDeps {
  return {
    resolveUser:     (req)                       => resolveCurrentUser(req, sessionDeps),
    listWorkspaces:  (projectId, userId)         => workspacesRepo.listWorkspacesByProjectAndUser(db, projectId, userId),
    createWorkspace: (projectId, userId, name)   => workspacesRepo.createWorkspace(db, projectId, userId, name),
    findWorkspace:   (id, userId)                => workspacesRepo.findWorkspaceById(db, id, userId),
    updateWorkspace: (id, userId, patch)         => workspacesRepo.updateWorkspace(db, id, userId, patch),
    deleteWorkspace: (id, userId)                => workspacesRepo.deleteWorkspace(db, id, userId),
    listWindowIds:   (workspaceIds)              => listWindowIdsByWorkspaceIds(db, workspaceIds),
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toWorkspace(row: DbWorkspace, windowIds: string[]): Workspace {
  return {
    id:        row.id,
    projectId: row.projectId,
    name:      row.name,
    windowIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildWindowMap(rows: Array<{ id: string; workspaceId: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const arr = map.get(row.workspaceId) ?? [];
    arr.push(row.id);
    map.set(row.workspaceId, arr);
  }
  return map;
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
  const windowRows = await deps.listWindowIds(rows.map((r) => r.id));
  const windowMap = buildWindowMap(windowRows);
  return respond(rows.map((r) => toWorkspace(r, windowMap.get(r.id) ?? [])));
}

export async function createWorkspaceDbController(
  ctx: RequestContext,
  deps: WorkspacesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const body = await parseJsonBody(ctx, CreateWorkspaceDbBody);
  if (!body.ok) return body.result;

  const row = await deps.createWorkspace(body.value.projectId, user.id, body.value.name);
  if (row === null) return respondNotFound(`Project ${body.value.projectId} not found`);
  return respondCreated(toWorkspace(row, []), getWorkspacePath(row.id));
}

export async function getWorkspaceDbController(
  ctx: RequestContext,
  deps: WorkspacesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const row = await deps.findWorkspace(id, user.id);
  if (!row) return respondNotFound(`Workspace ${id} not found`);
  const windowRows = await deps.listWindowIds([row.id]);
  return respond(toWorkspace(row, windowRows.map((cw) => cw.id)));
}

export async function patchWorkspaceDbController(
  ctx: RequestContext,
  deps: WorkspacesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const body = await parseJsonBody(ctx, PatchWorkspaceDbBody);
  if (!body.ok) return body.result;

  const id = ctx.params['id'] ?? '';
  const row = await deps.updateWorkspace(id, user.id, body.value);
  if (!row) return respondNotFound(`Workspace ${id} not found`);
  const windowRows = await deps.listWindowIds([row.id]);
  return respond(toWorkspace(row, windowRows.map((cw) => cw.id)));
}

export async function deleteWorkspaceDbController(
  ctx: RequestContext,
  deps: WorkspacesDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const deleted = await deps.deleteWorkspace(id, user.id);
  return deleted ? respondNoContent() : respondNotFound(`Workspace ${id} not found`);
}
