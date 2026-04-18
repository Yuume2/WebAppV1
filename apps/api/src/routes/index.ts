import { healthController } from '../controllers/health.controller.js';
import type { RouteDefinition } from '../lib/http.js';

export const routes: RouteDefinition[] = [
  { method: 'GET', path: '/health', handler: healthController },
  { method: 'GET', path: '/v1/health', handler: healthController },
];
