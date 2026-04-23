import { createServer, type Server } from 'node:http';
import { env } from '../config/env.js';
import { Router } from './router.js';
import { handleRequest } from '../middleware/handle-request.js';
import { routes } from '../routes/index.js';

export function buildRouter(): Router {
  const router = new Router();
  router.registerAll(routes);
  return router;
}

export function createApiServer(
  router: Router = buildRouter(),
  corsOrigin = env.corsOrigin,
): Server {
  return createServer((req, res) => {
    void handleRequest(router, req, res, corsOrigin);
  });
}
