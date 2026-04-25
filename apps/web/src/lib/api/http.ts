import type { ApiResponse } from '@webapp/types';
import type { ApiCallError } from '@/lib/api/client';
import { getApiBaseUrl } from '@/lib/api/env';

function makeError(
  message: string,
  init: Partial<ApiCallError> = {},
): ApiCallError {
  const err = new Error(message) as ApiCallError;
  if (init.cause !== undefined) err.cause = init.cause;
  if (init.status !== undefined) err.status = init.status;
  if (init.code !== undefined) err.code = init.code;
  return err;
}

async function requestJson<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw makeError('NEXT_PUBLIC_API_URL is not configured', { code: 'no_api_url' });

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    const aborted = (cause as { name?: string } | null)?.name === 'AbortError';
    throw makeError(aborted ? `Request to ${url} aborted` : `Network error calling ${url}`, {
      code: aborted ? 'timeout' : 'network_error',
      cause,
    });
  }
  clearTimeout(timer);

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (cause) {
    throw makeError(`Non-JSON response from ${url}`, {
      status: res.status,
      code: 'invalid_json',
      cause,
    });
  }

  const envelope = parsed as ApiResponse<T>;
  if (!envelope || typeof envelope !== 'object' || typeof (envelope as { ok?: unknown }).ok !== 'boolean') {
    throw makeError(`Malformed envelope from ${url}`, { status: res.status, code: 'invalid_envelope' });
  }
  if (!envelope.ok) {
    throw makeError(envelope.error.message, { status: res.status, code: envelope.error.code });
  }
  return envelope.data;
}

export function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson<T>('POST', path, body, signal);
}

export function putJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson<T>('PUT', path, body, signal);
}

export function patchJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson<T>('PATCH', path, body, signal);
}

export function deleteJson<T = null>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>('DELETE', path, undefined, signal);
}
