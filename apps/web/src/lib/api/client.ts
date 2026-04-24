import type { ApiResponse } from '@webapp/types';
import { getApiBaseUrl } from '@/lib/api/env';

export interface ApiCallError extends Error {
  cause?: unknown;
  status?: number;
  code?: string;
}

function toError(message: string, init: Partial<ApiCallError> = {}): ApiCallError {
  const err = new Error(message) as ApiCallError;
  if (init.cause !== undefined) err.cause = init.cause;
  if (init.status !== undefined) err.status = init.status;
  if (init.code !== undefined) err.code = init.code;
  return err;
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.ok === true) return 'data' in v;
  if (v.ok === false) {
    const e = v.error;
    return (
      !!e &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>).code === 'string' &&
      typeof (e as Record<string, unknown>).message === 'string'
    );
  }
  return false;
}

export interface ApiFetchOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  credentials?: RequestCredentials;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw toError('NEXT_PUBLIC_API_URL is not configured', { code: 'no_api_url' });

  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 5000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  let bodyInit: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    bodyInit = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: bodyInit,
      cache: options.cache ?? 'no-store',
      credentials: options.credentials ?? 'include',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as { name?: string } | null)?.name === 'AbortError';
    throw toError(aborted ? `Request to ${url} aborted after ${timeoutMs}ms` : `Network error calling ${url}`, {
      code: aborted ? 'timeout' : 'network_error',
      cause: err,
    });
  }
  clearTimeout(timer);

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (err) {
    throw toError(`Non-JSON response from ${url}`, {
      status: res.status,
      code: 'invalid_json',
      cause: err,
    });
  }

  if (!isApiResponse<T>(parsed)) {
    throw toError(`Malformed envelope from ${url}`, { status: res.status, code: 'invalid_envelope' });
  }

  if (!parsed.ok) {
    throw toError(parsed.error.message, { status: res.status, code: parsed.error.code });
  }

  return parsed.data;
}
