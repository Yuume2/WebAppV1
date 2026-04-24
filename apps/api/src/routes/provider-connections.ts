import type { RouteDefinition } from '../lib/http.js';
import type { ProviderConnectionsDeps } from '../controllers/provider-connections.controller.js';
import {
  listConnectionsController,
  getConnectionController,
  upsertConnectionController,
  deleteConnectionController,
  testConnectionController,
} from '../controllers/provider-connections.controller.js';
import { API_PROVIDER_CONNECTIONS_PATH } from '@webapp/types';

export function makeProviderConnectionRoutes(deps: ProviderConnectionsDeps): RouteDefinition[] {
  const base = API_PROVIDER_CONNECTIONS_PATH;
  return [
    { method: 'GET',    path: base,                        handler: (ctx) => listConnectionsController(ctx, deps) },
    { method: 'GET',    path: `${base}/:provider`,         handler: (ctx) => getConnectionController(ctx, deps) },
    { method: 'PUT',    path: `${base}/:provider`,         handler: (ctx) => upsertConnectionController(ctx, deps) },
    { method: 'DELETE', path: `${base}/:provider`,         handler: (ctx) => deleteConnectionController(ctx, deps) },
    { method: 'POST',   path: `${base}/:id/test`,          handler: (ctx) => testConnectionController(ctx, deps) },
  ];
}
