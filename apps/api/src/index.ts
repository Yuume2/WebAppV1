// Sentry must be initialized before anything else so it can observe the full
// lifetime of the process. Safe no-op when SENTRY_DSN_API is unset.
import { initSentry, flushSentry } from './lib/sentry.js';
initSentry();

import { env, getStartupWarnings } from './config/env.js';
import { logger } from './lib/logger.js';
import { createApiServer } from './lib/server.js';

for (const warning of getStartupWarnings(env)) {
  logger.warn('startup config warning', { detail: warning });
}

const server = createApiServer();

server.listen(env.port, () => {
  logger.info('api listening', {
    port: env.port,
    env: env.nodeEnv,
    version: env.serviceVersion,
  });
});

function shutdown(signal: string): void {
  logger.info('api shutting down', { signal });
  const hardExit = setTimeout(() => process.exit(1), 5000);
  hardExit.unref();
  void flushSentry().finally(() => {
    server.close(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
