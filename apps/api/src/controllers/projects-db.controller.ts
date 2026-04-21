import type { IncomingMessage } from 'node:http';
import type { Project } from '@webapp/types';
import { getProjectPath } from '@webapp/types';
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
import type { Db } from '../db/projects.repo.js';
import * as projectsRepo from '../db/projects.repo.js';

// ── Internal DB row shape ──────────────────────────────────────────────────────

interface DbProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Deps ──────────────────────────────────────────────────────────────────────

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

export interface ProjectsDeps {
  resolveUser: (req: IncomingMessage) => Promise<{ id: string } | null>;
  listProjects: (userId: string) => Promise<DbProject[]>;
  createProject: (userId: string, name: string, description?: string) => Promise<DbProject>;
  findProject: (id: string, userId: string) => Promise<DbProject | null>;
}

export function makeProjectsDeps(db: Db, sessionDeps: SessionDeps): ProjectsDeps {
  return {
    resolveUser:   (req)                       => resolveCurrentUser(req, sessionDeps),
    listProjects:  (userId)                    => projectsRepo.listProjectsByUserId(db, userId),
    createProject: (userId, name, description) => projectsRepo.createProject(db, userId, name, description),
    findProject:   (id, userId)               => projectsRepo.findProjectById(db, id, userId),
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toProject(row: DbProject): Project {
  return {
    id:          row.id,
    name:        row.name,
    description: row.description ?? undefined,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function listProjectsDbController(
  ctx: RequestContext,
  deps: ProjectsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const rows = await deps.listProjects(user.id);
  return respond(rows.map(toProject));
}

export async function createProjectDbController(
  ctx: RequestContext,
  deps: ProjectsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const bodyResult = await readJsonBody(ctx.req);
  if (!bodyResult.ok) return bodyResult.result;
  const body = bodyResult.data;

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return respondError('validation_error', 'name is required and must be a non-empty string');
  }

  const description = typeof body.description === 'string' ? body.description : undefined;
  const row = await deps.createProject(user.id, body.name.trim(), description);
  const project = toProject(row);
  return respondCreated(project, getProjectPath(project.id));
}

export async function getProjectDbController(
  ctx: RequestContext,
  deps: ProjectsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const row = await deps.findProject(id, user.id);
  return row ? respond(toProject(row)) : respondNotFound(`Project ${id} not found`);
}
