import type { RouteDefinition } from '../lib/http.js';
import type { MessagesDeps } from '../controllers/messages-db.controller.js';
import {
  listMessagesDbController,
  createMessageDbController,
  getMessageDbController,
  streamMessageDbController,
} from '../controllers/messages-db.controller.js';
import { API_MESSAGES_PATH, API_MESSAGES_STREAM_PATH } from '@webapp/types';

export function makeMessageDbRoutes(deps: MessagesDeps): RouteDefinition[] {
  return [
    { method: 'GET',  path: API_MESSAGES_PATH,            handler: (ctx) => listMessagesDbController(ctx, deps) },
    { method: 'POST', path: API_MESSAGES_PATH,            handler: (ctx) => createMessageDbController(ctx, deps) },
    { method: 'POST', path: API_MESSAGES_STREAM_PATH,     handler: (ctx) => streamMessageDbController(ctx, deps) },
    { method: 'GET',  path: `${API_MESSAGES_PATH}/:id`,   handler: (ctx) => getMessageDbController(ctx, deps) },
  ];
}
