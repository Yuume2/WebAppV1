import type { RouteDefinition } from '../lib/http.js';
import type { ChatWindowsDeps } from '../controllers/chat-windows-db.controller.js';
import {
  listChatWindowsDbController,
  createChatWindowDbController,
  getChatWindowDbController,
} from '../controllers/chat-windows-db.controller.js';
import { API_CHAT_WINDOWS_PATH } from '@webapp/types';

export function makeChatWindowDbRoutes(deps: ChatWindowsDeps): RouteDefinition[] {
  return [
    { method: 'GET',  path: API_CHAT_WINDOWS_PATH,            handler: (ctx) => listChatWindowsDbController(ctx, deps) },
    { method: 'POST', path: API_CHAT_WINDOWS_PATH,            handler: (ctx) => createChatWindowDbController(ctx, deps) },
    { method: 'GET',  path: `${API_CHAT_WINDOWS_PATH}/:id`,   handler: (ctx) => getChatWindowDbController(ctx, deps) },
  ];
}
