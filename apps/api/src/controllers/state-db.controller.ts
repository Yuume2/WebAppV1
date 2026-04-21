import type { IncomingMessage } from 'node:http';
import { inArray } from 'drizzle-orm';
import type { AppState, ChatWindow, Message, Project, Workspace } from '@webapp/types';
import {
  respond,
  respondError,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { resolveCurrentUser } from '../lib/resolve-user.js';
import type { Db as ProjectsDb } from '../db/projects.repo.js';
import { listProjectsByUserId } from '../db/projects.repo.js';
import { workspaces, chatWindows, messages } from '../db/schema.js';

// ── Deps ──────────────────────────────────────────────────────────────────────

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

export interface StateDeps {
  resolveUser: (req: IncomingMessage) => Promise<{ id: string } | null>;
  loadState: (userId: string) => Promise<AppState>;
}

export function makeStateDeps(db: ProjectsDb, sessionDeps: SessionDeps): StateDeps {
  return {
    resolveUser: (req) => resolveCurrentUser(req, sessionDeps),
    loadState:   (userId) => loadUserState(db, userId),
  };
}

// ── State aggregation ─────────────────────────────────────────────────────────

async function loadUserState(db: ProjectsDb, userId: string): Promise<AppState> {
  const dbProjects = await listProjectsByUserId(db, userId);
  if (dbProjects.length === 0) {
    return { projects: [], workspaces: [], chatWindows: [], messages: [] };
  }

  const projectIds = dbProjects.map((p) => p.id);
  const dbWorkspaces = await db.select().from(workspaces).where(inArray(workspaces.projectId, projectIds));

  if (dbWorkspaces.length === 0) {
    return {
      projects:    dbProjects.map(toProject),
      workspaces:  [],
      chatWindows: [],
      messages:    [],
    };
  }

  const workspaceIds = dbWorkspaces.map((w) => w.id);
  const dbChatWindows = await db.select().from(chatWindows).where(inArray(chatWindows.workspaceId, workspaceIds));

  const windowIdsByWorkspace = new Map<string, string[]>();
  for (const cw of dbChatWindows) {
    const arr = windowIdsByWorkspace.get(cw.workspaceId) ?? [];
    arr.push(cw.id);
    windowIdsByWorkspace.set(cw.workspaceId, arr);
  }

  if (dbChatWindows.length === 0) {
    return {
      projects:    dbProjects.map(toProject),
      workspaces:  dbWorkspaces.map((w) => toWorkspace(w, [])),
      chatWindows: [],
      messages:    [],
    };
  }

  const chatWindowIds = dbChatWindows.map((c) => c.id);
  const dbMessages = await db.select().from(messages).where(inArray(messages.chatWindowId, chatWindowIds));

  return {
    projects:    dbProjects.map(toProject),
    workspaces:  dbWorkspaces.map((w) => toWorkspace(w, windowIdsByWorkspace.get(w.id) ?? [])),
    chatWindows: dbChatWindows.map(toChatWindow),
    messages:    dbMessages.map(toMessage),
  };
}

// ── Shape converters ──────────────────────────────────────────────────────────

function toProject(row: { id: string; name: string; description: string | null; createdAt: Date; updatedAt: Date }): Project {
  return {
    id:          row.id,
    name:        row.name,
    description: row.description ?? undefined,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
  };
}

function toWorkspace(row: { id: string; projectId: string; name: string; createdAt: Date; updatedAt: Date }, windowIds: string[]): Workspace {
  return {
    id:        row.id,
    projectId: row.projectId,
    name:      row.name,
    windowIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toChatWindow(row: { id: string; workspaceId: string; title: string; provider: 'openai' | 'anthropic' | 'perplexity'; model: string; createdAt: Date; updatedAt: Date }): ChatWindow {
  return {
    id:          row.id,
    workspaceId: row.workspaceId,
    title:       row.title,
    provider:    row.provider,
    model:       row.model,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
  };
}

function toMessage(row: { id: string; chatWindowId: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: Date }): Message {
  return {
    id:           row.id,
    chatWindowId: row.chatWindowId,
    role:         row.role,
    content:      row.content,
    createdAt:    row.createdAt.toISOString(),
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

export async function stateDbController(
  ctx: RequestContext,
  deps: StateDeps,
): Promise<InternalResult> {
  const user = await deps.resolveUser(ctx.req);
  if (!user) return respondError('unauthenticated', 'Not authenticated', 401);

  const state = await deps.loadState(user.id);
  return respond(state);
}
