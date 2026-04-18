import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { Router } from './lib/router.js';
import { handleRequest } from './middleware/handle-request.js';
import { routes } from './routes/index.js';

const router = new Router();
router.registerAll(routes);

const server = createServer((req, res) => {
  void handleRequest(router, req, res);
});

server.listen(env.port, () => {
  logger.info('api listening', {
    port: env.port,
    env: env.nodeEnv,
    version: env.serviceVersion,
  });
});

function shutdown(signal: string): void {
  logger.info('api shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
