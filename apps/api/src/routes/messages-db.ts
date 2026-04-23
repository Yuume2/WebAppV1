import type { RouteDefinition } from '../lib/http.js';
import type { MessagesDeps } from '../controllers/messages-db.controller.js';
import {
  listMessagesDbController,
  createMessageDbController,
  getMessageDbController,
} from '../controllers/messages-db.controller.js';
import { API_MESSAGES_PATH } from '@webapp/types';

export function makeMessageDbRoutes(deps: MessagesDeps): RouteDefinition[] {
  return [
    { method: 'GET',  path: API_MESSAGES_PATH,            handler: (ctx) => listMessagesDbController(ctx, deps) },
    { method: 'POST', path: API_MESSAGES_PATH,            handler: (ctx) => createMessageDbController(ctx, deps) },
    { method: 'GET',  path: `${API_MESSAGES_PATH}/:id`,   handler: (ctx) => getMessageDbController(ctx, deps) },
  ];
}
