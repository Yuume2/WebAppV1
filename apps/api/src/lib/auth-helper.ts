import type { IncomingMessage } from 'node:http';
import { respondError, type InternalResult } from './http.js';

type UserResolver = (req: IncomingMessage) => Promise<{ id: string } | null>;

/**
 * Resolves the authenticated user via the supplied resolver, or returns the
 * standard 401 InternalResult if no user is present.
 *
 * Every authenticated controller currently repeats:
 *
 *   const user = await deps.resolveUser(ctx.req);
 *   if (!user) return respondError('unauthenticated', 'Not authenticated', 401);
 *
 * This helper centralises that boilerplate so the 401 envelope (code +
 * message + status) stays identical across routes. Controllers that opt in
 * call:
 *
 *   const auth = await requireUser(ctx.req, deps.resolveUser);
 *   if (!auth.ok) return auth.result;
 *   const user = auth.user;
 */
export async function requireUser<U extends { id: string }>(
  req: IncomingMessage,
  resolver: (req: IncomingMessage) => Promise<U | null>,
): Promise<{ ok: true; user: U } | { ok: false; result: InternalResult }> {
  const user = await resolver(req);
  if (!user) {
    return { ok: false, result: respondError('unauthenticated', 'Not authenticated', 401) };
  }
  return { ok: true, user };
}

export type { UserResolver };
