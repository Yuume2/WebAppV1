import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, SafeUser } from '@webapp/types';
import { Router } from '../lib/router.js';
import { createApiServer } from '../lib/server.js';
import { makeAuthRoutes } from './auth.js';
import type { AuthDeps } from '../controllers/auth.controller.js';
import { RateLimiter } from '../lib/rate-limiter.js';
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
    resetRateLimit:         () => {},
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
    // Lock down the cookie hardening attributes so a future refactor that
    // accidentally drops SameSite or Path cannot ship without failing CI.
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toMatch(/SameSite=(Lax|Strict|None)/);
    expect(cookie).toContain('Path=/');
    // Max-Age must be positive on a fresh session — a 0 here would be the
    // signature of a 'log everyone out' deploy bug.
    const maxAgeMatch = cookie?.match(/Max-Age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    expect(Number(maxAgeMatch?.[1])).toBeGreaterThan(0);
    // CRITICAL: a successful signup ships a Set-Cookie with the session
    // token. If this response gets cached by a CDN, every cache HIT below
    // hands the same session cookie to a different user. Cache-Control:
    // no-store is the only thing keeping that catastrophe from being one
    // misconfigured CDN away.
    expect(res.headers.get('cache-control')).toBe('no-store');
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

  it('persists lowercase email (createUser receives the normalised form, not the raw input)', async () => {
    // The response email is lowercase (pinned by 'normalises email to
    // lowercase'), but that doesn't prove the *storage* call also got
    // the normalised form — a refactor could lowercase post-create
    // and break the unique-constraint guarantee on the column. Pin
    // that the createUser dep receives the lowercased email directly.
    let createdEmail: string | undefined;
    const { baseUrl, close } = await startServer(makeDeps({
      createUser: async (email, hash, displayName) => {
        createdEmail = email;
        return mockUser({ email, passwordHash: hash, displayName: displayName ?? null });
      },
    }));
    await post(baseUrl, '/v1/auth/signup', { email: 'CaSeD@Example.COM', password: 'password123' });
    expect(createdEmail).toBe('cased@example.com');
    await close();
  });

  it.each([
    ['missing-at-sign',     'aliceexample.com'],
    ['empty-local-part',    '@example.com'],
    ['empty-domain',        'alice@'],
    ['missing-tld',         'alice@localhost'],
    ['embedded-space',      'al ice@example.com'],
    ['double-at',           'alice@@example.com'],
    ['leading-at-only',     '@'],
  ])('rejects malformed email "%s" (%s) with invalid_body', async (_label, badEmail) => {
    // The signup schema's regex is /^[^@\s]+@[^@\s]+\.[^@\s]+$/ — pin a
    // representative set of malformed emails so a future loosening of the
    // pattern can't ship without updating these cases.
    const res = await post(base, '/v1/auth/signup', { email: badEmail, password: 'password123' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('invalid_body');
  });

  it('rejects whitespace-only displayName via schema trim + min:1', async () => {
    // displayName is optional but, when present, the schema trims and
    // enforces min:1 — a whitespace-only value should reject with
    // invalid_body, not silently coerce to '' or to null. Pin so a
    // refactor that drops trim doesn't accidentally let blank names
    // through.
    const res = await post(base, '/v1/auth/signup', {
      email:       'spaceslayer@example.com',
      password:    'password123',
      displayName: '   ',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('invalid_body');
  });

  it('trims a non-empty displayName before persisting (no leading/trailing whitespace stored)', async () => {
    let createdName: string | undefined;
    const { baseUrl, close } = await startServer(makeDeps({
      createUser: async (_email, _hash, displayName) => {
        createdName = displayName;
        return mockUser({ displayName: displayName ?? null });
      },
    }));
    const res = await post(baseUrl, '/v1/auth/signup', {
      email:       'trimmed@example.com',
      password:    'password123',
      displayName: '  Alice  ',
    });
    expect(res.status).toBe(201);
    expect(createdName).toBe('Alice');
    await close();
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
    // 409 must not be cacheable either — a cached 409 would falsely tell a
    // legit signup attempt that their email is taken even after the
    // conflicting account was deleted upstream.
    expect(res.headers.get('cache-control')).toBe('no-store');
    // 409 must NOT emit a Set-Cookie either — there's no session to grant
    // when the signup failed.
    expect(res.headers.get('set-cookie')).toBeNull();
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
    // Same caching catastrophe as signup: a 200 with Set-Cookie that hits a
    // shared cache would broadcast one user's session to everyone. Pin
    // Cache-Control: no-store on the success path explicitly.
    expect(res.headers.get('cache-control')).toBe('no-store');

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

  it('trims surrounding whitespace from the email before lookup (form-paste tolerance)', async () => {
    // The schema trims; the lookup must therefore see the clean form. A
    // user pasting their email from a column with trailing whitespace
    // shouldn't be locked out. Pin the trim → lookup chain with an explicit
    // capture of the email passed to findUserByEmail.
    let lookupEmail: string | null = null;
    const { baseUrl, close } = await startServer(makeDeps({
      findUserByEmail: async (email) => { lookupEmail = email; return null; },
    }));
    await post(baseUrl, '/v1/auth/login', { email: '  alice@example.com  ', password: 'whatever' });
    expect(lookupEmail).toBe('alice@example.com');
    await close();
  });

  it('lowercases the email before user lookup (mirror of signup normalisation)', async () => {
    // Both signup and login lowercase the email server-side. If they
    // disagreed, a user who signed up with 'Alice@example.com' would be
    // unable to log back in with the exact-same casing — the signup row
    // is stored lowercased, the login lookup would receive 'Alice@...'.
    // Pin the contract: login must lookup the lowercased form.
    let lookupEmail: string | null = null;
    const { baseUrl, close } = await startServer(makeDeps({
      findUserByEmail: async (email) => { lookupEmail = email; return null; },
    }));
    await post(baseUrl, '/v1/auth/login', { email: 'ALICE@EXAMPLE.COM', password: 'whatever' });
    expect(lookupEmail).toBe('alice@example.com');
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

  it('returns the same code AND the same message string for unknown email vs wrong password', async () => {
    // The whole point of the unified 'Invalid email or password' string is to
    // be impossible to distinguish from the caller's POV. If a future
    // refactor adds a more helpful 'No account with that email' branch, this
    // test will fail — forcing a re-look at the enumeration trade-off.

    // Path A: email unknown.
    const a = await startServer(makeDeps({ findUserByEmail: async () => null }));
    const ra = await post(a.baseUrl, '/v1/auth/login', { email: 'ghost@example.com', password: 'anything' });
    expect(ra.status).toBe(401);
    const ba = (await ra.json()) as ApiResponse<never>;
    if (ba.ok) throw new Error('expected error');
    await a.close();

    // Path B: email known, wrong password.
    const b = await startServer(makeDeps({
      findUserByEmail: async () => mockUser({ passwordHash: realHash }),
    }));
    const rb = await post(b.baseUrl, '/v1/auth/login', { email: 'test@example.com', password: 'wrongpassword' });
    expect(rb.status).toBe(401);
    const bb = (await rb.json()) as ApiResponse<never>;
    if (bb.ok) throw new Error('expected error');
    await b.close();

    expect(ba.error.code).toBe(bb.error.code);
    expect(ba.error.message).toBe(bb.error.message);
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

  it('SafeUser body carries exactly the contract fields (id, email, displayName, createdAt, updatedAt)', async () => {
    // Pin the full SafeUser shape: a refactor that drops a field would
    // silently break frontend rendering; one that adds a sensitive field
    // (e.g. role, internal_metadata) would leak it. Pin both the inclusion
    // list AND the exact key set so additions/removals fail CI.
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async (h) => h === KNOWN_HASH ? mockSession(h) : null,
      findUserById:           async (id) => id === USER.id ? USER : null,
    }));
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<SafeUser>;
    if (!body.ok) throw new Error('expected ok');
    expect(Object.keys(body.data).sort()).toEqual([
      'createdAt',
      'displayName',
      'email',
      'id',
      'updatedAt',
    ]);
    expect(typeof body.data.email).toBe('string');
    expect(body.data.displayName === null || typeof body.data.displayName === 'string').toBe(true);
    // ISO date strings must parse — pin against accidental Date-object
    // serialisation breakage that would ship a {} or NaN to the client.
    expect(() => new Date(body.data.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(body.data.updatedAt).toISOString()).not.toThrow();
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

  it('opportunistically cleans up an expired session row', async () => {
    const EXPIRED_TOKEN = 'e'.repeat(64);
    const EXPIRED_HASH  = hashSessionToken(EXPIRED_TOKEN);
    const deletes: string[] = [];
    let resolveDel!: () => void;
    const deleteDone = new Promise<void>((r) => { resolveDel = r; });
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async (h) => h === EXPIRED_HASH
        ? { id: h, userId: 'user-1', expiresAt: new Date(Date.now() - 60_000), createdAt: new Date() }
        : null,
      deleteSession: async (h) => { deletes.push(h); resolveDel(); },
    }));
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${EXPIRED_TOKEN}` },
    });
    expect(res.status).toBe(401);
    await deleteDone;
    expect(deletes).toEqual([EXPIRED_HASH]);
    await close();
  });

  it('expired-session cleanup is fire-and-forget (response does not wait for the delete)', async () => {
    // The opportunistic delete must not add latency to the 401 — the user is
    // bouncing through an unauth response and shouldn't be slowed down by
    // hygiene work. Use a deleteSession that never resolves and assert the
    // 401 still returns within a tight budget.
    const EXPIRED_TOKEN = '7'.repeat(64);
    const EXPIRED_HASH  = hashSessionToken(EXPIRED_TOKEN);
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async (h) => h === EXPIRED_HASH
        ? { id: h, userId: 'user-1', expiresAt: new Date(Date.now() - 60_000), createdAt: new Date() }
        : null,
      deleteSession: () => new Promise<void>(() => { /* never resolves */ }),
    }));
    const startedAt = Date.now();
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${EXPIRED_TOKEN}` },
    });
    expect(res.status).toBe(401);
    expect(Date.now() - startedAt).toBeLessThan(500);
    await close();
  });

  it('expired-session cleanup swallows delete errors (no crash on hygiene failure)', async () => {
    // The catch in meController is .catch(() => {}). A throwing delete must
    // not affect the response or surface as an unhandled rejection that
    // could crash the process.
    const EXPIRED_TOKEN = '8'.repeat(64);
    const EXPIRED_HASH  = hashSessionToken(EXPIRED_TOKEN);
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async (h) => h === EXPIRED_HASH
        ? { id: h, userId: 'user-1', expiresAt: new Date(Date.now() - 60_000), createdAt: new Date() }
        : null,
      deleteSession: async () => { throw new Error('db down on cleanup'); },
    }));
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${EXPIRED_TOKEN}` },
    });
    expect(res.status).toBe(401);
    await close();
  });

  it('does NOT call deleteSession when token simply does not match', async () => {
    const calls: string[] = [];
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async () => null,
      deleteSession:          async (h) => { calls.push(h); },
    }));
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${'f'.repeat(64)}` },
    });
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
    await close();
  });

  it('always returns the unauthenticated code on 401, regardless of which subcheck failed', async () => {
    // Three distinct failure paths inside meController: no cookie, no
    // matching session, session resolves to a now-deleted user. They MUST
    // share the same error code so a caller cannot distinguish 'never
    // logged in' from 'session was revoked' from 'account was deleted' —
    // that distinction is an account-enumeration oracle.

    // 1. No cookie
    const noCookie = await startServer(makeDeps());
    const r1 = await fetch(`${noCookie.baseUrl}/v1/auth/me`);
    expect(r1.status).toBe(401);
    const b1 = (await r1.json()) as ApiResponse<never>;
    if (b1.ok) throw new Error('expected error');
    await noCookie.close();

    // 2. Cookie present, session unknown
    const noSession = await startServer(makeDeps({
      findSessionByTokenHash: async () => null,
    }));
    const r2 = await fetch(`${noSession.baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${'9'.repeat(64)}` },
    });
    expect(r2.status).toBe(401);
    const b2 = (await r2.json()) as ApiResponse<never>;
    if (b2.ok) throw new Error('expected error');
    await noSession.close();

    // 3. Cookie present, session valid, user gone
    const noUser = await startServer(makeDeps({
      findSessionByTokenHash: async () => mockSession(KNOWN_HASH),
      findUserById:           async () => null,
    }));
    const r3 = await fetch(`${noUser.baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN}` },
    });
    expect(r3.status).toBe(401);
    const b3 = (await r3.json()) as ApiResponse<never>;
    if (b3.ok) throw new Error('expected error');
    await noUser.close();

    expect(b1.error.code).toBe('unauthenticated');
    expect(b2.error.code).toBe('unauthenticated');
    expect(b3.error.code).toBe('unauthenticated');
    // The human-readable message is also unified across all paths so a
    // sophisticated probe can't distinguish 'session expired' from 'user
    // deleted' from 'no cookie' via the message string. Pin all three.
    expect(b1.error.message).toBe('Not authenticated');
    expect(b2.error.message).toBe('Not authenticated');
    expect(b3.error.message).toBe('Not authenticated');
  });

  it('401 from /me does not emit a Set-Cookie header (no surprise session clear)', async () => {
    // /me is a read endpoint. A 401 should not mutate the caller's cookie
    // jar — only the explicit /logout path is allowed to emit Set-Cookie
    // for the session cookie. Pin this so a refactor that defensively
    // 'cleans up' a stale cookie on /me 401 doesn't accidentally log out
    // a legit user whose session got invalidated server-side.
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async () => null,
    }));
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${'a'.repeat(64)}` },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    await close();
  });

  it('rejects whitespace-only session cookie without touching the session repo', async () => {
    // Probe with a whitespace-only token: must short-circuit before any DB
    // lookup and return the same envelope as a missing cookie. Otherwise an
    // attacker could measure the timing difference between 'no cookie' and
    // 'cookie that ends up calling the repo'.
    let lookupCalls = 0;
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async () => { lookupCalls++; return null; },
    }));
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=   ` },
    });
    expect(res.status).toBe(401);
    expect(lookupCalls).toBe(0);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.message).toBe('Not authenticated');
    await close();
  });
});

// ── Alias: /v1/me → /v1/auth/me ───────────────────────────────────────────────

describe('GET /v1/me (alias of /v1/auth/me)', () => {
  const KNOWN_TOKEN = 'c'.repeat(64);
  const KNOWN_HASH  = hashSessionToken(KNOWN_TOKEN);
  const USER        = mockUser();

  it('returns 200 with safe user when session is valid', async () => {
    const { baseUrl, close } = await startServer(makeDeps({
      findSessionByTokenHash: async (h) => h === KNOWN_HASH ? mockSession(h) : null,
      findUserById:           async (id) => id === USER.id ? USER : null,
    }));
    const res = await fetch(`${baseUrl}/v1/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${KNOWN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<SafeUser>;
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.id).toBe(USER.id);
    expect('passwordHash' in body.data).toBe(false);
    await close();
  });

  it('returns 401 with no cookie', async () => {
    const { baseUrl, close } = await startServer(makeDeps());
    const res = await fetch(`${baseUrl}/v1/me`);
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

  it('does not call deleteSession when the cookie value is whitespace-only', async () => {
    // Same probe-resistance logic as meController: a whitespace-only token
    // must not reach the session repo. The cookie is still cleared on the
    // way out (Max-Age=0) so a subsequent normal logout still works.
    let deleteCalls = 0;
    const { baseUrl, close } = await startServer(makeDeps({
      deleteSession: async () => { deleteCalls++; },
    }));
    const res = await post(baseUrl, '/v1/auth/logout', {}, { Cookie: `${SESSION_COOKIE_NAME}=  ` });
    expect(res.status).toBe(200);
    expect(deleteCalls).toBe(0);
    expect(getSetCookie(res)).toContain('Max-Age=0');
    await close();
  });

  it('is idempotent — calling logout twice with the same cookie is a 200 each time', async () => {
    // The frontend may double-fire logout (button + tab-close handler), and
    // a second call after the session is already gone must not error. The
    // controller deletes the session by token-hash, which is naturally
    // idempotent — pin it with a regression test so a future refactor that
    // returns 401 on already-deleted sessions can't ship without failing CI.
    const { baseUrl, close } = await startServer(makeDeps({
      deleteSession: async () => { /* idempotent: succeed both times */ },
    }));
    const cookie = `${SESSION_COOKIE_NAME}=${'1'.repeat(64)}`;
    const r1 = await post(baseUrl, '/v1/auth/logout', {}, { Cookie: cookie });
    const r2 = await post(baseUrl, '/v1/auth/logout', {}, { Cookie: cookie });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Both responses must clear the cookie too — second logout is not a
    // no-op from the cookie POV; it should still emit Max-Age=0 so a stale
    // browser cookie can't survive the second call.
    expect(getSetCookie(r1)).toContain('Max-Age=0');
    expect(getSetCookie(r2)).toContain('Max-Age=0');
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
    // 429 must still ride the standard security + hardening + observability
    // headers — defenders should be able to triage rate-limit storms with the
    // same tooling they use for any other 4xx.
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('no-store');
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

  it('rate-limit gate fires BEFORE the user-lookup / hash work on signup', async () => {
    // Mirror of the login gate-ordering test: a full bucket must short-
    // circuit BEFORE findUserByEmail so an attacker can't enumerate emails
    // by timing the difference between rate-limited-existing-user and
    // rate-limited-fresh-email.
    let userLookups = 0;
    const { baseUrl, close } = await startServer(makeDeps({
      checkRateLimit:  () => ({ ok: false, retryAfterSecs: 60 }),
      findUserByEmail: async () => { userLookups++; return null; },
    }));
    await post(baseUrl, '/v1/auth/signup', { email: 'a@b.com', password: 'password123' });
    expect(userLookups).toBe(0);
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

  it('rejects whitespace-only email with 400 invalid_body (schema trims and enforces min:1)', async () => {
    // The login schema trims the email field — pin that whitespace-only
    // input rejects with invalid_body, not 401, and never reaches the
    // user repo. Otherwise an attacker could probe whether the system
    // accepts 'empty' emails as a backdoor (it won't, but pin it).
    let lookupCalls = 0;
    const { baseUrl, close } = await startServer(makeDeps({
      findUserByEmail: async () => { lookupCalls++; return null; },
    }));
    const res = await post(baseUrl, '/v1/auth/login', { email: '   ', password: 'anything' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (body.ok) throw new Error('expected error');
    expect(body.error.code).toBe('invalid_body');
    expect(lookupCalls).toBe(0);
    await close();
  });

  it('rate-limit gate fires BEFORE the user lookup (no enumeration via timing)', async () => {
    // Pin the order of operations: when the bucket is full, login must
    // short-circuit BEFORE calling findUserByEmail. Otherwise a probe
    // could measure the response time difference between an existing-
    // user-but-rate-limited path and a non-existing-user-rate-limited
    // path, which is an account-enumeration oracle.
    let userLookups = 0;
    const { baseUrl, close } = await startServer(makeDeps({
      checkRateLimit:  () => ({ ok: false, retryAfterSecs: 60 }),
      findUserByEmail: async () => { userLookups++; return null; },
    }));
    await post(baseUrl, '/v1/auth/login', { email: 'a@b.com', password: 'whatever' });
    expect(userLookups).toBe(0);
    await close();
  });

  it('resets the bucket after a successful login (legit user is not penalised)', async () => {
    const realHash = await hashPassword('validpassword');
    const resetCalls: string[] = [];
    const { baseUrl, close } = await startServer(makeDeps({
      findUserByEmail: async () => mockUser({ passwordHash: realHash }),
      resetRateLimit:  (key) => { resetCalls.push(key); },
    }));
    const res = await post(baseUrl, '/v1/auth/login', { email: 'test@example.com', password: 'validpassword' });
    expect(res.status).toBe(200);
    expect(resetCalls).toHaveLength(1);
    await close();
  });

  it('does NOT reset the bucket after a failed login (brute-force window stays)', async () => {
    const resetCalls: string[] = [];
    const { baseUrl, close } = await startServer(makeDeps({
      findUserByEmail: async () => null,
      resetRateLimit:  (key) => { resetCalls.push(key); },
    }));
    const res = await post(baseUrl, '/v1/auth/login', { email: 'no@one.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(resetCalls).toHaveLength(0);
    await close();
  });
});

describe('rate limiting — signup', () => {
  it('resets the bucket after a successful signup', async () => {
    const resetCalls: string[] = [];
    const { baseUrl, close } = await startServer(makeDeps({
      resetRateLimit: (key) => { resetCalls.push(key); },
    }));
    const res = await post(baseUrl, '/v1/auth/signup', { email: 'fresh@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(resetCalls).toHaveLength(1);
    await close();
  });
});

// Real RateLimiter wired through deps — proves the bucket increments AND
// resets after the configured window when used end-to-end through the route.
describe('rate limiting — end-to-end with real limiter', () => {
  it('blocks after max attempts then unblocks once the window elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const limiter = new RateLimiter(2, 60_000);
      const { baseUrl, close } = await startServer(makeDeps({
        checkRateLimit: (key) => limiter.check(key),
      }));

      // Two attempts allowed, third returns 429.
      for (let i = 0; i < 2; i++) {
        const r = await post(baseUrl, '/v1/auth/login', { email: 'a@b.com', password: 'pw' });
        expect([200, 401]).toContain(r.status);
      }
      const blocked = await post(baseUrl, '/v1/auth/login', { email: 'a@b.com', password: 'pw' });
      expect(blocked.status).toBe(429);

      vi.advanceTimersByTime(60_000);

      const after = await post(baseUrl, '/v1/auth/login', { email: 'a@b.com', password: 'pw' });
      expect(after.status).not.toBe(429);
      await close();
    } finally {
      vi.useRealTimers();
    }
  });
});
