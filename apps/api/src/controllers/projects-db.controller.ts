import type { IncomingMessage } from 'node:http';
import type { Project } from '@webapp/types';
import { getProjectPath } from '@webapp/types';
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
import type { Db, ProjectPatch } from '../db/projects.repo.js';
import * as projectsRepo from '../db/projects.repo.js';

// ── Body schemas ──────────────────────────────────────────────────────────────

const CreateProjectDbBody = s.object({
  name:        s.string({ min: 1, max: 200, trim: true }),
  description: s.optional(s.nullable(s.string({ max: 2000 }))),
});

const PatchProjectDbBody = s.object({
  name:        s.optional(s.string({ min: 1, max: 200, trim: true })),
  description: s.optional(s.nullable(s.string({ max: 2000 }))),
});

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
  updateProject: (id: string, userId: string, patch: ProjectPatch) => Promise<DbProject | null>;
  deleteProject: (id: string, userId: string) => Promise<boolean>;
}

export function makeProjectsDeps(db: Db, sessionDeps: SessionDeps): ProjectsDeps {
  return {
    resolveUser:   (req)                       => resolveCurrentUser(req, sessionDeps),
    listProjects:  (userId)                    => projectsRepo.listProjectsByUserId(db, userId),
    createProject: (userId, name, description) => projectsRepo.createProject(db, userId, name, description),
    findProject:   (id, userId)                => projectsRepo.findProjectById(db, id, userId),
    updateProject: (id, userId, patch)         => projectsRepo.updateProject(db, id, userId, patch),
    deleteProject: (id, userId)                => projectsRepo.deleteProject(db, id, userId),
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

  const body = await parseJsonBody(ctx, CreateProjectDbBody);
  if (!body.ok) return body.result;

  const row = await deps.createProject(user.id, body.value.name, body.value.description ?? undefined);
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

export async function patchProjectDbController(
  ctx: RequestContext,
  deps: ProjectsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const body = await parseJsonBody(ctx, PatchProjectDbBody);
  if (!body.ok) return body.result;

  const id = ctx.params['id'] ?? '';
  const row = await deps.updateProject(id, user.id, body.value);
  return row ? respond(toProject(row)) : respondNotFound(`Project ${id} not found`);
}

export async function deleteProjectDbController(
  ctx: RequestContext,
  deps: ProjectsDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const id = ctx.params['id'] ?? '';
  const deleted = await deps.deleteProject(id, user.id);
  return deleted ? respondNoContent() : respondNotFound(`Project ${id} not found`);
}
