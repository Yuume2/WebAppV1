import type { SafeUser } from '@webapp/types';
import {
  parseJsonBody,
  respond,
  respondError,
  respondRateLimited,
  getClientIp,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { s } from '../lib/schema.js';
import { RateLimiter, type RateLimitResult } from '../lib/rate-limiter.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { generateSessionToken, hashSessionToken, sessionExpiresAt } from '../lib/session-token.js';
import { SESSION_COOKIE_NAME } from '../config/auth.js';
import { parseCookies, serializeSetCookie, clearCookieHeader } from '../lib/cookie.js';
import { env } from '../config/env.js';
import type { Db } from '../db/users.repo.js';
import * as usersRepo from '../db/users.repo.js';
import * as sessionsRepo from '../db/sessions.repo.js';

// ── Internal DB row shapes (postgres-js returns Dates for timestamp columns) ──

interface DbUser {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DbSession {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

// ── Dependency interface — injected at route-registration time ─────────────────

export interface AuthDeps {
  findUserByEmail: (email: string) => Promise<DbUser | null>;
  findUserById:    (id: string)    => Promise<DbUser | null>;
  createUser:      (email: string, passwordHash: string, displayName?: string) => Promise<DbUser>;
  createSession:   (tokenHash: string, userId: string, expiresAt: Date) => Promise<DbSession>;
  findSessionByTokenHash: (tokenHash: string) => Promise<DbSession | null>;
  deleteSession:   (tokenHash: string) => Promise<void>;
  checkRateLimit:  (key: string) => RateLimitResult;
}

// 10 attempts per IP per 15 minutes for both signup and login.
const authLimiter = new RateLimiter(10, 15 * 60 * 1000);

/** Bind the real DB to the AuthDeps interface. */
export function makeAuthDeps(db: Db): AuthDeps {
  return {
    findUserByEmail:        (email)                        => usersRepo.findUserByEmail(db, email),
    findUserById:           (id)                           => usersRepo.findUserById(db, id),
    createUser:             (email, hash, displayName)     => usersRepo.createUser(db, email, hash, displayName),
    createSession:          (tokenHash, userId, expiresAt) => sessionsRepo.createSession(db, tokenHash, userId, expiresAt),
    findSessionByTokenHash: (tokenHash)                    => sessionsRepo.findSessionByTokenHash(db, tokenHash),
    deleteSession:          (tokenHash)                    => sessionsRepo.deleteSession(db, tokenHash),
    checkRateLimit:         (key)                          => authLimiter.check(key),
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toSafeUser(user: DbUser): SafeUser {
  return {
    id:          user.id,
    email:       user.email,
    displayName: user.displayName,
    createdAt:   user.createdAt.toISOString(),
    updatedAt:   user.updatedAt.toISOString(),
  };
}

function cookieHeader(token: string): Record<string, string> {
  const secure = env.nodeEnv === 'production';
  return { 'Set-Cookie': serializeSetCookie(SESSION_COOKIE_NAME, token, secure) };
}

// ── Body schemas ──────────────────────────────────────────────────────────────

const SignupBody = s.object({
  email:       s.string({ min: 1, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, trim: true }),
  password:    s.string({ min: 8, max: 200 }),
  displayName: s.optional(s.string({ min: 1, max: 100, trim: true })),
});

const LoginBody = s.object({
  email:    s.string({ min: 1, trim: true }),
  password: s.string({ min: 1 }),
});

// ── Controllers ───────────────────────────────────────────────────────────────

export async function signupController(ctx: RequestContext, deps: AuthDeps): Promise<InternalResult> {
  const rl = deps.checkRateLimit(getClientIp(ctx.req));
  if (!rl.ok) return respondRateLimited(rl.retryAfterSecs);

  const body = await parseJsonBody(ctx, SignupBody);
  if (!body.ok) return body.result;

  const email = body.value.email.toLowerCase();
  const password = body.value.password;
  const displayName = body.value.displayName;

  const existing = await deps.findUserByEmail(email);
  if (existing) {
    return respondError('conflict', 'An account with that email already exists', 409);
  }

  const passwordHash  = await hashPassword(password);
  const user          = await deps.createUser(email, passwordHash, displayName);

  const token     = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  await deps.createSession(tokenHash, user.id, sessionExpiresAt());

  return { httpStatus: 201, body: { ok: true, data: toSafeUser(user) }, headers: cookieHeader(token) };
}

export async function loginController(ctx: RequestContext, deps: AuthDeps): Promise<InternalResult> {
  const rl = deps.checkRateLimit(getClientIp(ctx.req));
  if (!rl.ok) return respondRateLimited(rl.retryAfterSecs);

  const body = await parseJsonBody(ctx, LoginBody);
  if (!body.ok) return body.result;

  const email = body.value.email.toLowerCase();
  const password = body.value.password;

  const user  = await deps.findUserByEmail(email);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    return respondError('unauthenticated', 'Invalid email or password', 401);
  }

  const token     = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  await deps.createSession(tokenHash, user.id, sessionExpiresAt());

  return { httpStatus: 200, body: { ok: true, data: toSafeUser(user) }, headers: cookieHeader(token) };
}

export async function logoutController(ctx: RequestContext, deps: AuthDeps): Promise<InternalResult> {
  const cookies = parseCookies(ctx.req.headers.cookie);
  const token   = cookies[SESSION_COOKIE_NAME];

  if (token) {
    await deps.deleteSession(hashSessionToken(token));
  }

  const secure = env.nodeEnv === 'production';
  return {
    httpStatus: 200,
    body:    { ok: true, data: null },
    headers: { 'Set-Cookie': clearCookieHeader(SESSION_COOKIE_NAME, secure) },
  };
}

export async function meController(ctx: RequestContext, deps: AuthDeps): Promise<InternalResult> {
  const cookies = parseCookies(ctx.req.headers.cookie);
  const token   = cookies[SESSION_COOKIE_NAME];

  if (!token) return respondError('unauthenticated', 'Not authenticated', 401);

  const session = await deps.findSessionByTokenHash(hashSessionToken(token));
  if (!session || session.expiresAt <= new Date()) {
    return respondError('unauthenticated', 'Session expired or invalid', 401);
  }

  const user = await deps.findUserById(session.userId);
  if (!user) return respondError('unauthenticated', 'User not found', 401);

  return respond(toSafeUser(user));
}
