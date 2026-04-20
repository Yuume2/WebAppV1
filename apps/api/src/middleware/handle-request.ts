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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': env.corsOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function handleRequest(
  router: Router,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const requestId = generateRequestId();
  const startedAt = Date.now();
  const rawMethod = req.method ?? 'GET';
  const host = req.headers.host ?? `localhost:${env.port}`;
  const url = new URL(req.url ?? '/', `http://${host}`);
  const path = url.pathname;

  for (const [k, v] of Object.entries(CORS_HEADERS)) {
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
    const status = router.hasPath(path) ? 405 : 404;
    const code = status === 405 ? 'method_not_allowed' : 'not_found';
    const message = status === 405 ? `Method ${rawMethod} not allowed for ${path}` : `No route for ${path}`;
    writeJson(res, status, fail(code, message), requestId);
    logger.info('request handled', {
      requestId,
      method: rawMethod,
      path,
      status,
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  const { handler, params } = match;
  const ctx: RequestContext = { method: rawMethod, path, url, requestId, req, params };

  try {
    const { httpStatus, body } = await handler(ctx);
    writeJson(res, httpStatus, body, requestId);
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
