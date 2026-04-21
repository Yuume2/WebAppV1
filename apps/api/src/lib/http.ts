import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiError, ApiResponse } from '@webapp/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface RequestContext {
  method: HttpMethod;
  path: string;
  url: URL;
  requestId: string;
  req: IncomingMessage;
  params: Readonly<Record<string, string>>;
}

export type RouteHandler = (ctx: RequestContext) => Promise<ApiResponse<unknown>> | ApiResponse<unknown>;

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

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static notFound(message: string, details?: unknown): HttpError {
    return new HttpError(404, 'not_found', message, details);
  }
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
