import type { AIProvider, ApiResponse, ProviderConnection } from '@webapp/types';
import { API_PROVIDER_CONNECTIONS_PATH } from '@webapp/types';
import { apiFetch, type ApiCallError } from '@/lib/api/client';
import { getApiBaseUrl } from '@/lib/api/env';
import { putJson } from '@/lib/api/http';

export function upsertProviderConnection(
  provider: AIProvider,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ProviderConnection> {
  return putJson<ProviderConnection>(
    `${API_PROVIDER_CONNECTIONS_PATH}/${encodeURIComponent(provider)}`,
    { apiKey },
    signal,
  );
}

export function listProviderConnections(signal?: AbortSignal): Promise<ProviderConnection[]> {
  return apiFetch<ProviderConnection[]>(
    API_PROVIDER_CONNECTIONS_PATH,
    signal ? { signal } : undefined,
  );
}

export interface TestConnectionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export async function testProviderConnection(
  connectionId: string,
  signal?: AbortSignal,
): Promise<TestConnectionResult> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    const err = new Error('NEXT_PUBLIC_API_URL is not configured') as ApiCallError;
    err.code = 'no_api_url';
    throw err;
  }
  const url = `${baseUrl}${API_PROVIDER_CONNECTIONS_PATH}/${encodeURIComponent(connectionId)}/test`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    const aborted = (cause as { name?: string } | null)?.name === 'AbortError';
    const err = new Error(
      aborted ? `Request to ${url} aborted` : `Network error calling ${url}`,
    ) as ApiCallError;
    err.code = aborted ? 'timeout' : 'network_error';
    err.cause = cause;
    throw err;
  }
  clearTimeout(timer);

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (cause) {
    const err = new Error(`Non-JSON response from ${url}`) as ApiCallError;
    err.status = res.status;
    err.code = 'invalid_json';
    err.cause = cause;
    throw err;
  }

  const envelope = parsed as ApiResponse<TestConnectionResult>;
  if (!envelope || typeof envelope !== 'object' || typeof (envelope as { ok?: unknown }).ok !== 'boolean') {
    const err = new Error(`Malformed envelope from ${url}`) as ApiCallError;
    err.status = res.status;
    err.code = 'invalid_envelope';
    throw err;
  }
  if (!envelope.ok) {
    const err = new Error(envelope.error.message) as ApiCallError;
    err.status = res.status;
    err.code = envelope.error.code;
    throw err;
  }
  return envelope.data;
}

export async function removeProviderConnection(
  provider: string,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    const err = new Error('NEXT_PUBLIC_API_URL is not configured') as ApiCallError;
    err.code = 'no_api_url';
    throw err;
  }
  const url = `${baseUrl}${API_PROVIDER_CONNECTIONS_PATH}/${encodeURIComponent(provider)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'DELETE',
      headers: { accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    const aborted = (cause as { name?: string } | null)?.name === 'AbortError';
    const err = new Error(
      aborted ? `Request to ${url} aborted` : `Network error calling ${url}`,
    ) as ApiCallError;
    err.code = aborted ? 'timeout' : 'network_error';
    err.cause = cause;
    throw err;
  }
  clearTimeout(timer);

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (cause) {
    const err = new Error(`Non-JSON response from ${url}`) as ApiCallError;
    err.status = res.status;
    err.code = 'invalid_json';
    err.cause = cause;
    throw err;
  }

  const envelope = parsed as ApiResponse<unknown>;
  if (!envelope || typeof envelope !== 'object' || typeof (envelope as { ok?: unknown }).ok !== 'boolean') {
    const err = new Error(`Malformed envelope from ${url}`) as ApiCallError;
    err.status = res.status;
    err.code = 'invalid_envelope';
    throw err;
  }
  if (!envelope.ok) {
    const err = new Error(envelope.error.message) as ApiCallError;
    err.status = res.status;
    err.code = envelope.error.code;
    throw err;
  }
}
