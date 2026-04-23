import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiError, ApiErrorCode, ApiResponse } from '@webapp/types';
import { env } from '../config/env.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface RequestContext {
  method: HttpMethod;
  path: string;
  url: URL;
  requestId: string;
  req: IncomingMessage;
  params: Record<string, string>;
}

/** Internal pipeline result — carries an explicit HTTP status alongside the body. */
export interface InternalResult {
  httpStatus: number;
  body: ApiResponse<unknown>;
  headers?: Record<string, string>;
}

export type RouteHandler = (ctx: RequestContext) => Promise<InternalResult> | InternalResult;

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function fail(code: ApiErrorCode, message: string, details?: unknown): ApiResponse<never> {
  const error: ApiError = { code, message, ...(details === undefined ? {} : { details }) };
  return { ok: false, error };
}

export function respond<T>(data: T, httpStatus = 200): InternalResult {
  return { httpStatus, body: ok(data) };
}

export function respondCreated<T>(data: T, location?: string): InternalResult {
  return { httpStatus: 201, body: ok(data), ...(location ? { headers: { Location: location } } : {}) };
}

export function respondError(code: ApiErrorCode, message: string, httpStatus = 400, details?: unknown): InternalResult {
  return { httpStatus, body: fail(code, message, details) };
}

export function respondNotFound(message: string): InternalResult {
  return { httpStatus: 404, body: fail('not_found', message) };
}

export function respondRateLimited(retryAfterSecs: number): InternalResult {
  return {
    httpStatus: 429,
    body: fail('rate_limited', 'Too many requests — please try again later'),
    headers: { 'Retry-After': String(retryAfterSecs) },
  };
}

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return req.socket?.remoteAddress ?? 'unknown';
}

export function writeJson(
  res: ServerResponse,
  status: number,
  body: ApiResponse<unknown>,
  requestId: string,
  extraHeaders?: Record<string, string>,
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

export function isHttpMethod(method: string | undefined): method is HttpMethod {
  return (
    method === 'GET' ||
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE' ||
    method === 'OPTIONS'
  );
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 100 KB — generous for any legitimate JSON payload at MVP/dev scale. */
export const BODY_SIZE_LIMIT = 100 * 1024;

export function readBody(req: IncomingMessage, maxBytes = BODY_SIZE_LIMIT): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        reject(Object.assign(new Error('Request body exceeds size limit'), { code: 'payload_too_large' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON'), { code: 'invalid_json' })); }
    });
    req.on('error', (err) => { if (!done) { done = true; reject(err); } });
  });
}

/**
 * Combines content-type check + size-limited body read + JSON parse into one call.
 * Returns `{ ok: true, data }` on success, or `{ ok: false, result }` with the ready InternalResult on failure.
 */
export async function readJsonBody(
  req: IncomingMessage,
): Promise<{ ok: true; data: unknown } | { ok: false; result: InternalResult }> {
  const ct = req.headers['content-type'] ?? '';
  if (!ct.includes('application/json')) {
    return { ok: false, result: respondError('unsupported_media_type', 'Content-Type must be application/json', 415) };
  }
  try {
    const data = await readBody(req, env.maxBodyBytes);
    return { ok: true, data };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'payload_too_large') {
      return { ok: false, result: respondError('payload_too_large', 'Request body exceeds size limit', 413) };
    }
    return { ok: false, result: respondError('invalid_json', 'Request body must be valid JSON') };
  }
}
