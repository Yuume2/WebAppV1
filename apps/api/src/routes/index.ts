import { healthController } from '../controllers/health.controller.js';
import { createChatWindowController, getChatWindowController, listChatWindowsController } from '../controllers/chat-windows.controller.js';
import { createMessageController, getMessageController, listMessagesController } from '../controllers/messages.controller.js';
import { createProjectController, getProjectController, listProjectsController } from '../controllers/projects.controller.js';
import { stateController } from '../controllers/state.controller.js';
import { createWorkspaceController, getWorkspaceController, listWorkspacesController } from '../controllers/workspaces.controller.js';
import { makeAuthDeps } from '../controllers/auth.controller.js';
import { makeProjectsDeps } from '../controllers/projects-db.controller.js';
import { makeWorkspacesDeps } from '../controllers/workspaces-db.controller.js';
import { makeChatWindowsDeps } from '../controllers/chat-windows-db.controller.js';
import { makeMessagesDeps } from '../controllers/messages-db.controller.js';
import { makeStateDeps, stateDbController } from '../controllers/state-db.controller.js';
import { createDb } from '../lib/db.js';
import { env } from '../config/env.js';
import type { RouteDefinition } from '../lib/http.js';
import { devRoutes } from './dev.js';
import { makeAuthRoutes } from './auth.js';
import { makeProjectDbRoutes } from './projects-db.js';
import { makeWorkspaceDbRoutes } from './workspaces-db.js';
import { makeChatWindowDbRoutes } from './chat-windows-db.js';
import { makeMessageDbRoutes } from './messages-db.js';
import {
  API_HEALTH_PATH,
  API_PROJECTS_PATH,
  API_WORKSPACES_PATH,
  API_CHAT_WINDOWS_PATH,
  API_MESSAGES_PATH,
  API_STATE_PATH,
} from '@webapp/types';

// Single shared DB instance — only created when DATABASE_URL is configured.
const db = env.databaseUrl ? createDb() : null;
const authDeps = db ? makeAuthDeps(db) : null;

// Auth routes require DB. Without DATABASE_URL they are simply absent.
const authRoutes: RouteDefinition[] = authDeps
  ? makeAuthRoutes(authDeps)
  : [];

// Project routes: DB-backed user-scoped when DB is available, in-memory fallback otherwise.
// The fallback keeps existing tests and MVP dev session unaffected.
const projectRoutes: RouteDefinition[] = (db && authDeps)
  ? makeProjectDbRoutes(makeProjectsDeps(db, authDeps))
  : [
    { method: 'GET',  path: API_PROJECTS_PATH,          handler: listProjectsController },
    { method: 'POST', path: API_PROJECTS_PATH,          handler: createProjectController },
    { method: 'GET',  path: `${API_PROJECTS_PATH}/:id`, handler: getProjectController },
  ];

// Workspace routes: DB-backed user-scoped when DB is available, in-memory fallback otherwise.
const workspaceRoutes: RouteDefinition[] = (db && authDeps)
  ? makeWorkspaceDbRoutes(makeWorkspacesDeps(db, authDeps))
  : [
    { method: 'GET',  path: API_WORKSPACES_PATH,            handler: listWorkspacesController },
    { method: 'POST', path: API_WORKSPACES_PATH,            handler: createWorkspaceController },
    { method: 'GET',  path: `${API_WORKSPACES_PATH}/:id`,   handler: getWorkspaceController },
  ];

// Chat-window routes: DB-backed user-scoped when DB is available, in-memory fallback otherwise.
const chatWindowRoutes: RouteDefinition[] = (db && authDeps)
  ? makeChatWindowDbRoutes(makeChatWindowsDeps(db, authDeps))
  : [
    { method: 'GET',  path: API_CHAT_WINDOWS_PATH,            handler: listChatWindowsController },
    { method: 'POST', path: API_CHAT_WINDOWS_PATH,            handler: createChatWindowController },
    { method: 'GET',  path: `${API_CHAT_WINDOWS_PATH}/:id`,   handler: getChatWindowController },
  ];

// Message routes: DB-backed user-scoped when DB is available, in-memory fallback otherwise.
const messageRoutes: RouteDefinition[] = (db && authDeps)
  ? makeMessageDbRoutes(makeMessagesDeps(db, authDeps))
  : [
    { method: 'GET',  path: API_MESSAGES_PATH,            handler: listMessagesController },
    { method: 'POST', path: API_MESSAGES_PATH,            handler: createMessageController },
    { method: 'GET',  path: `${API_MESSAGES_PATH}/:id`,   handler: getMessageController },
  ];

// State handler: DB-backed (auth-required) when DB is available, in-memory fallback otherwise.
const stateHandler = (db && authDeps)
  ? (ctx: Parameters<typeof stateDbController>[0]) => stateDbController(ctx, makeStateDeps(db, authDeps))
  : stateController;

export const businessRoutes: RouteDefinition[] = [
  { method: 'GET', path: API_HEALTH_PATH, handler: healthController },

  ...projectRoutes,

  ...workspaceRoutes,

  ...chatWindowRoutes,

  ...messageRoutes,

  { method: 'GET',  path: API_STATE_PATH, handler: stateHandler },
];

export const routes: RouteDefinition[] = [
  ...businessRoutes,
  ...authRoutes,
  ...(env.enableDevEndpoints ? devRoutes : []),
];
