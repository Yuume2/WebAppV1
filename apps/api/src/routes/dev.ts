import { devResetController, devSeedController } from '../controllers/dev.controller.js';
import type { RouteDefinition } from '../lib/http.js';

export const devRoutes: RouteDefinition[] = [
  { method: 'POST', path: '/v1/dev/reset', handler: devResetController },
  { method: 'POST', path: '/v1/dev/seed',  handler: devSeedController },
];
