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
import { captureException } from '../lib/sentry.js';
import { checkCsrf } from '../lib/csrf.js';

function parseAllowedOrigins(corsOrigin: string): string[] {
  return corsOrigin
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Public, non-user-scoped routes — health probes and version metadata. These
// responses are identical regardless of the session cookie, so emitting
// Vary: Cookie on them only adds noise to caches and (worse) prevents
// shared caches from coalescing public health checks across viewers.
const NON_USER_SCOPED_EXACT = new Set<string>([
  '/health',
  '/v1/health',
  '/v1/health/deep',
  '/v1/version',
]);

export function isUserScopedPath(path: string): boolean {
  if (NON_USER_SCOPED_EXACT.has(path)) return false;
  return true;
}

function buildCorsHeaders(corsOrigin: string, requestOrigin: string | null, userScoped: boolean): Record<string, string> {
  if (corsOrigin === '*') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (userScoped) {
      // Defence-in-depth: user-scoped responses vary by the session cookie.
      // Cache-Control: no-store on user-scoped routes is the primary guard;
      // this Vary signal is the secondary guard for any shared cache (CDN,
      // corp proxy) that decides to honour private/max-age over no-store.
      headers['Vary'] = 'Cookie';
    }
    return headers;
  }
  const allowed = parseAllowedOrigins(corsOrigin);
  // ACAO must echo the actual request Origin when credentials are involved.
  // For a multi-origin allowlist we pick the matching entry; for a single-
  // origin config we keep the historical behaviour (always echo the configured
  // value, even when no Origin header is on the response request).
  const echoed =
    requestOrigin && allowed.includes(requestOrigin)
      ? requestOrigin
      : (allowed[0] ?? corsOrigin);
  return {
    'Access-Control-Allow-Origin': echoed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    // Origin: always varies by the requesting origin (multi-allowlist).
    // Cookie: only added on user-scoped routes (defence-in-depth on top of
    // per-route Cache-Control: no-store). Public health/version responses
    // get Vary: Origin only so they remain cacheable across viewers.
    'Vary': userScoped ? 'Origin, Cookie' : 'Origin',
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

  const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  const userScoped = isUserScopedPath(path);
  for (const [k, v] of Object.entries(buildCorsHeaders(corsOrigin, reqOrigin, userScoped))) {
    res.setHeader(k, v);
  }

  // Defensive security headers — cheap, no behavioural change. Opt-out is per-route
  // via res.removeHeader if a future use case ever needs framing or sniffing.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Block legacy Adobe cross-domain policy probes (crossdomain.xml /
  // clientaccesspolicy.xml) — we don't serve any, but we also don't want
  // a permissive default to be inferred. Same shape as Helmet's default.
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // No DNS prefetching for embedded URLs — browsers ignore this for our
  // JSON anyway, but it's a free hardening signal for any HTML error page
  // a misconfigured proxy might surface.
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  // Tell crawlers not to index API endpoints. Most never reach them, but
  // misrouted Googlebot hits do happen and indexing JSON envelopes is just
  // noise + a small information-disclosure surface.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

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

  const csrf = checkCsrf(req, rawMethod, corsOrigin);
  if (!csrf.ok) {
    writeJson(res, 403, fail('csrf_error', csrf.reason ?? 'CSRF check failed'), requestId);
    logger.warn('request rejected (csrf)', { requestId, method: rawMethod, path, status: 403 });
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
  const ctx: RequestContext = { method: rawMethod, path, url, requestId, req, res, params };

  try {
    const result = await handler(ctx);
    if (!result.streamed) {
      writeJson(res, result.httpStatus, result.body, requestId, result.headers);
    }
    logger.info('request handled', {
      requestId,
      method: rawMethod,
      path,
      status: result.httpStatus,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureException(err, {
      requestId,
      method: rawMethod,
      path,
    });
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
