import type { ApiResponse, HealthStatus } from '@webapp/types';
import { env } from '../config/env.js';
import { ok } from '../lib/http.js';
import type { RequestContext } from '../lib/http.js';

const startedAt = Date.now();

export function healthController(_ctx: RequestContext): ApiResponse<HealthStatus> {
  const body: HealthStatus = {
    service: 'webapp-api',
    status: 'ok',
    version: env.serviceVersion,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };
  return ok(body);
}
