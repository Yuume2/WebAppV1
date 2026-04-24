import type {
  AuthLoginInput,
  AuthRegisterInput,
  SafeUser,
} from '@webapp/types';
import {
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_ME_PATH,
  API_AUTH_SIGNUP_PATH,
} from '@webapp/types';
import { apiFetch } from '@/lib/api/client';

export function login(input: AuthLoginInput): Promise<SafeUser> {
  return apiFetch<SafeUser>(API_AUTH_LOGIN_PATH, {
    method: 'POST',
    body: input,
    credentials: 'include',
  });
}

export function register(input: AuthRegisterInput): Promise<SafeUser> {
  return apiFetch<SafeUser>(API_AUTH_SIGNUP_PATH, {
    method: 'POST',
    body: input,
    credentials: 'include',
  });
}

export function logout(): Promise<null> {
  return apiFetch<null>(API_AUTH_LOGOUT_PATH, {
    method: 'POST',
    credentials: 'include',
  });
}

export function me(signal?: AbortSignal): Promise<SafeUser> {
  return apiFetch<SafeUser>(API_AUTH_ME_PATH, {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  });
}
