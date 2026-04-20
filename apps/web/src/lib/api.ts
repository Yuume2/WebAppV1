import type { ApiResponse, AppState } from '@webapp/types';
import { API_STATE_PATH } from '@webapp/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}

export async function fetchState(): Promise<AppState> {
  return apiFetch<AppState>(API_STATE_PATH);
}
