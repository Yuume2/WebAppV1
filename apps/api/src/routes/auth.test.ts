import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, SafeUser } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeAuthRoutes } from './auth.js';
import type { AuthDeps } from '../controllers/auth.controller.js';
import { hashPassword } from '../lib/password.js';
import { hashSessionToken } from '../lib/session-token.js';
import { SESSION_COOKIE_NAME } from '../config/auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockUser(overrides: Partial<{
  id: string; email: string; displayName: string | null;
  passwordHash: string; createdAt: Date; updatedAt: Date;
}> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: null,
    passwordHash: 'placeholder',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function mockSession(tokenHash: string, userId = 'user-1') {
  return {
    id: tokenHash,
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  };
}

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    findUserByEmail:        async () => null,
    findUserById:           async () => null,
    createUser:             async (email, passwordHash, displayName) =>
      mockUser({ email, passwordHash, displayName: displayName ?? null }),
    createSession:          async (tokenHash, userId, expiresAt) =>
      ({ id: tokenHash, userId, expiresAt, createdAt: new Date() }),
    findSessionByTokenHash: async () => null,
    deleteSession:          async () => {},
    checkRateLimit:         () => ({ ok: true, retryAfterSecs: 0 }),
    ...overrides,
  };
}

async function startServer(deps: AuthDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const router = new Router();
  router.registerAll(makeAuthRoutes(deps));
  const server: Server = createApiServer(router);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
  };
}

function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function getSetCookie(res: Response): string | null {
  return res.headers.get('set-cookie');
}

// ── Signup ────────────────────────────────────────────────────────────────────

describe('POST /v1/auth/signup', () => {
  let base: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ baseUrl: base, close } = await startServer(makeDeps()));
  });
  afterAll(() => close());

  it('creates a user and returns 201 with safe user + Set-Cookie', async () => {
    const res = await post(base, '/v1/auth/signup', { email: 'alice@example.com', password: 'password123' });
    expect(res.status).toBe(201);

    const body = (await res.json()) as ApiResponse<SafeUser>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.email).toBe('alice@example.com');
    expect('passwordHash' in body.data).toBe(false);

    const cookie = getSetCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
  });

  it('normalises email to lowercase', async () => {
    const res = await post(base, '/v1/auth/signup', { email: 'ALICE@EXAMPLE.COM', password: 'password123' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<SafeUser>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.email).toBe('alice@example.com');
  });

  it('returns 400 invalid_body for missing email', async () => {
    const res = await post(base, '/v1/auth/signup', { password: 'password123' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('invalid_body');
  });

  it('returns 400 invalid_body for short password', async () => {
    const res = await post(base, '/v1/auth/signup', { email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('invalid_body');
  });

  it('returns 409 for duplicate email', async () => {
    const { baseUrl, close: c } = await startServer(
      makeDeps({ findUserByEmail: async () => mockUser() }),
    );
    const res = await post(baseUrl, '/v1/auth/signup', { email: 'dupe@example.com', password: 'password123' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('conflict');
    await c();
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

describe('POST /v1/auth/login', () => {
  let realHash: string;

  beforeAll(async () => {
    realHash = await hashPassword('validpassword');
  });

  it('returns 200 with safe user + Set-Cookie on valid credentials', async () => {
    const { baseUrl, close } = await startServer(
      makeDeps({ findUserByEmail: async () => mockUser({ passwordHash: realHash }) }),
    );
    const res = await post(baseUrl, '/v1/auth/login', { email: 'test@example.com', password: 'validpassword' });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<SafeUser>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect('passwordHash' in body.data).toBe(false);

    const cookie = getSetCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);

    await close();
  });

  it('returns 401 for unknown email', async () => {
    const { baseUrl, close } = await startServer(makeDeps());
    const res = await post(baseUrl, '/v1/auth/login', { email: 'nobody@example.com', password: 'anything' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
    await close();
  });

  it('returns 401 for wrong password', async () => {
    const { baseUrl, close } = await startServer(
      makeDeps({ findUserByEmail: async () => mockUser({ passwordHash: realHash }) }),
    );
    const res = await post(baseUrl, '/v1/auth/login', { email: 'test@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
    await close();
  });
});

// ── Me ────────────────────────────────────────────────────────────────────────

describe('GET /v1/auth/me', () => {
  // Use a fixed token so we can control what the mock session lookup returns.
  const KNOWN_TOKEN = 'a'.repeat(64);
  const KNOWN_HASH  = hashSessionToken(KNOWN_TOKEN);
  const USER        = mockUser();

  it('returns 200 with safe user when session is valid', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async (h) => h === KNOWN_HASH ? mockSession(h) : null,
      findUserById:           async (id) => id === USER.id ? USER : null,
    }));
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<SafeUser>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe(USER.id);
    expect('passwordHash' in body.data).toBe(false);
    await close();
  });

  it('returns 401 with no cookie', async () => {
    const { baseUrl, close } = await startServer(makeDeps());
    const res = await fetch(`${baseUrl}/v1/auth/me`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('unauthenticated');
    await close();
  });

  it('returns 401 with unknown/expired session', async () => {
    const { baseUrl, close } = await startServer(makeDeps());
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${'b'.repeat(64)}` },
    });
    expect(res.status).toBe(401);
    await close();
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe('POST /v1/auth/logout', () => {
  const KNOWN_TOKEN = 'c'.repeat(64);
  const KNOWN_HASH  = hashSessionToken(KNOWN_TOKEN);

  it('deletes the session and clears the cookie', async () => {
    let deleted: string | undefined;
    const { baseUrl, close } = await startServer(makeDeps({
      deleteSession: async (hash) => { deleted = hash; },
    }));

    const res = await post(baseUrl, '/v1/auth/logout', {}, { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN}` });
    expect(res.status).toBe(200);
    expect(deleted).toBe(KNOWN_HASH);

    const cookie = getSetCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain('Max-Age=0');

    await close();
  });

  it('succeeds even with no cookie present', async () => {
    const { baseUrl, close } = await startServer(makeDeps());
    const res = await post(baseUrl, '/v1/auth/logout', {});
    expect(res.status).toBe(200);
    const cookie = getSetCookie(res);
    expect(cookie).toContain('Max-Age=0');
    await close();
  });

  it('returns 401 on /me after logout', async () => {
    const KNOWN_TOKEN2 = 'd'.repeat(64);
    const KNOWN_HASH2  = hashSessionToken(KNOWN_TOKEN2);
    let sessionExists  = true;
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async (h) => (sessionExists && h === KNOWN_HASH2) ? mockSession(h) : null,
      findUserById:           async () => mockUser(),
      deleteSession:          async ()  => { sessionExists = false; },
    }));

    // me before logout → 200
    const before = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN2}` },
    });
    expect(before.status).toBe(200);

    // logout
    await post(baseUrl, '/v1/auth/logout', {}, { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN2}` });

    // me after logout → 401
    const after = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN2}` },
    });
    expect(after.status).toBe(401);

    await close();
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('rate limiting — signup', () => {
  it('returns 429 when checkRateLimit signals limited', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      checkRateLimit: () => ({ ok: false, retryAfterSecs: 60 }),
    }));
    const res = await post(baseUrl, '/v1/auth/signup', { email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('rate_limited');
    expect(res.headers.get('retry-after')).toBe('60');
    await close();
  });

  it('succeeds when checkRateLimit allows', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      checkRateLimit: () => ({ ok: true, retryAfterSecs: 0 }),
    }));
    const res = await post(baseUrl, '/v1/auth/signup', { email: 'new@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    await close();
  });
});

describe('rate limiting — login', () => {
  it('returns 429 when checkRateLimit signals limited', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      checkRateLimit: () => ({ ok: false, retryAfterSecs: 120 }),
    }));
    const res = await post(baseUrl, '/v1/auth/login', { email: 'a@b.com', password: 'pw' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('rate_limited');
    expect(res.headers.get('retry-after')).toBe('120');
    await close();
  });
});
