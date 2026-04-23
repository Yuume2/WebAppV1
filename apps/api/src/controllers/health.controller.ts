import type { HealthStatus } from '@webapp/types';
import { env } from '../config/env.js';
import { respond, type InternalResult, type RequestContext } from '../lib/http.js';

const startedAt = Date.now();

export function healthController(_ctx: RequestContext): InternalResult {
  const data: HealthStatus = {
    service: 'webapp-api',
    status: 'ok',
    version: env.serviceVersion,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };
  return respond(data);
}
