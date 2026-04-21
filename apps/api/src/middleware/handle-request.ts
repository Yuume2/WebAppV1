import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '../config/env.js';
import {
  fail,
  isHttpMethod,
  writeJson,
  type RequestContext,
} from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { generateRequestId } from '../lib/request-id.js';
import type { Router } from '../lib/router.js';

function buildCorsHeaders(origin: string): Record<string, string> {
  if (origin === '*') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  // Explicit origin: enable credentials (required for cookie-based auth).
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export async function handleRequest(
  router: Router,
  req: IncomingMessage,
  res: ServerResponse,
  corsOrigin = env.corsOrigin,
): Promise<void> {
  const requestId = generateRequestId();
  const startedAt = Date.now();
  const rawMethod = req.method ?? 'GET';
  const host = req.headers.host ?? `localhost:${env.port}`;
  const url = new URL(req.url ?? '/', `http://${host}`);
  const path = url.pathname;

  for (const [k, v] of Object.entries(buildCorsHeaders(corsOrigin))) {
    res.setHeader(k, v);
  }

  if (rawMethod === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!isHttpMethod(rawMethod)) {
    writeJson(res, 405, fail('method_not_allowed', `Method ${rawMethod} not allowed`), requestId);
    logger.warn('request rejected', { requestId, method: rawMethod, path, status: 405 });
    return;
  }

  const match = router.match(rawMethod, path);

  if (!match) {
    const noMatchStatus = router.hasPath(path) ? 405 : 404;
    if (noMatchStatus === 405) {
      const allowed = router.allowedMethods(path);
      writeJson(res, 405, fail('method_not_allowed', `Method ${rawMethod} not allowed for ${path}`), requestId, { Allow: allowed.join(', ') });
    } else {
      writeJson(res, 404, fail('not_found', `No route for ${path}`), requestId);
    }
    logger.info('request handled', {
      requestId,
      method: rawMethod,
      path,
      status: noMatchStatus,
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  const { handler, params } = match;
  const ctx: RequestContext = { method: rawMethod, path, url, requestId, req, params };

  try {
    const { httpStatus, body, headers } = await handler(ctx);
    writeJson(res, httpStatus, body, requestId, headers);
    logger.info('request handled', {
      requestId,
      method: rawMethod,
      path,
      status: httpStatus,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    writeJson(res, 500, fail('internal_error', 'Internal server error'), requestId);
    logger.error('request failed', {
      requestId,
      method: rawMethod,
      path,
      status: 500,
      durationMs: Date.now() - startedAt,
      error: message,
    });
  }
}
