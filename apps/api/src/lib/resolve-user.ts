import type { IncomingMessage } from 'node:http';
import { parseCookies } from './cookie.js';
import { hashSessionToken } from './session-token.js';
import { SESSION_COOKIE_NAME } from '../config/auth.js';

interface SessionDeps {
  findSessionByTokenHash: (hash: string) => Promise<{ userId: string; expiresAt: Date } | null>;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
}

/**
 * Resolves the authenticated user from the session cookie.
 * Returns null if no valid session is present.
 */
export async function resolveCurrentUser(
  req: IncomingMessage,
  deps: SessionDeps,
): Promise<{ id: string; email: string } | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const session = await deps.findSessionByTokenHash(hashSessionToken(token));
  if (!session || session.expiresAt <= new Date()) return null;

  return deps.findUserById(session.userId);
}
