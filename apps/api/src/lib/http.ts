import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiError, ApiResponse } from '@webapp/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface RequestContext {
  method: HttpMethod;
  path: string;
  url: URL;
  requestId: string;
  req: IncomingMessage;
}

/** Internal pipeline result — carries an explicit HTTP status alongside the body. */
export interface InternalResult {
  httpStatus: number;
  body: ApiResponse<unknown>;
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

export function fail(code: string, message: string, details?: unknown): ApiResponse<never> {
  const error: ApiError = { code, message, ...(details === undefined ? {} : { details }) };
  return { ok: false, error };
}

export function respond<T>(data: T, httpStatus = 200): InternalResult {
  return { httpStatus, body: ok(data) };
}

export function respondCreated<T>(data: T): InternalResult {
  return { httpStatus: 201, body: ok(data) };
}

export function respondError(code: string, message: string, httpStatus = 400, details?: unknown): InternalResult {
  return { httpStatus, body: fail(code, message, details) };
}

export function respondNotFound(message: string): InternalResult {
  return { httpStatus: 404, body: fail('not_found', message) };
}

export function writeJson(
  res: ServerResponse,
  status: number,
  body: ApiResponse<unknown>,
  requestId: string,
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
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

export function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON'), { code: 'invalid_json' })); }
    });
    req.on('error', reject);
  });
}
