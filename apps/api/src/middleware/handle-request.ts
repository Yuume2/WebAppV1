import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '../config/env.js';
import {
  fail,
  HttpError,
  isHttpMethod,
  writeJson,
  type RequestContext,
} from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { generateRequestId } from '../lib/request-id.js';
import type { Router } from '../lib/router.js';

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

  const ctx: RequestContext = {
    method: rawMethod,
    path,
    url,
    requestId,
    req,
    params: Object.freeze({ ...match.params }),
  };

  try {
    const result = await match.handler(ctx);
    const status = result.ok ? 200 : 400;
    writeJson(res, status, result, requestId);
    logger.info('request handled', {
      requestId,
      method: rawMethod,
      path,
      status,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      writeJson(res, err.status, fail(err.code, err.message, err.details), requestId);
      logger.info('request handled', {
        requestId,
        method: rawMethod,
        path,
        status: err.status,
        durationMs: Date.now() - startedAt,
      });
      return;
    }
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
