import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { resolveCurrentUser } from './resolve-user.js';
import { hashSessionToken } from './session-token.js';
import { SESSION_COOKIE_NAME } from '../config/auth.js';

function reqWith(cookieHeader: string | undefined): IncomingMessage {
  // resolveCurrentUser only reads req.headers.cookie — minimal mock is enough.
  return { headers: { cookie: cookieHeader } } as unknown as IncomingMessage;
}

const USER = { id: 'user-1', email: 'alice@example.com' };

describe('resolveCurrentUser', () => {
  it('returns null when no cookie header is present', async () => {
    const r = await resolveCurrentUser(reqWith(undefined), {
      findSessionByTokenHash: async () => { throw new Error('should not be called'); },
      findUserById:           async () => { throw new Error('should not be called'); },
    });
    expect(r).toBeNull();
  });

  it('returns null when the session cookie is missing from a populated header', async () => {
    const r = await resolveCurrentUser(reqWith('theme=dark'), {
      findSessionByTokenHash: async () => { throw new Error('should not be called'); },
      findUserById:           async () => { throw new Error('should not be called'); },
    });
    expect(r).toBeNull();
  });

  it('returns null when the token does not match any session', async () => {
    const r = await resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=ghost`), {
      findSessionByTokenHash: async () => null,
      findUserById:           async () => USER,
    });
    expect(r).toBeNull();
  });

  it('returns null when the matching session has already expired', async () => {
    const expired = { userId: USER.id, expiresAt: new Date(Date.now() - 1) };
    const r = await resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=stale`), {
      findSessionByTokenHash: async () => expired,
      findUserById:           async () => USER,
    });
    expect(r).toBeNull();
  });

  it('hashes the cookie token before looking up the session (the raw token is never sent to the repo)', async () => {
    let receivedHash: string | null = null;
    const future = { userId: USER.id, expiresAt: new Date(Date.now() + 60_000) };
    await resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=raw-token-xyz`), {
      findSessionByTokenHash: async (hash) => { receivedHash = hash; return future; },
      findUserById:           async () => USER,
    });
    expect(receivedHash).not.toBe('raw-token-xyz');
    expect(receivedHash).toBe(hashSessionToken('raw-token-xyz'));
  });

  it('returns the user when the session is valid', async () => {
    const future = { userId: USER.id, expiresAt: new Date(Date.now() + 60_000) };
    const r = await resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=good`), {
      findSessionByTokenHash: async () => future,
      findUserById:           async (id) => id === USER.id ? USER : null,
    });
    expect(r).toEqual(USER);
  });

  it('returns null when the session points at a user that no longer exists', async () => {
    const future = { userId: 'gone', expiresAt: new Date(Date.now() + 60_000) };
    const r = await resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=orphan`), {
      findSessionByTokenHash: async () => future,
      findUserById:           async () => null,
    });
    expect(r).toBeNull();
  });

  it('treats a session whose expiresAt equals "now" as already expired (boundary)', async () => {
    // Lock the clock so we can assert the exact equality semantics.
    const now = new Date('2026-01-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const r = await resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=edge`), {
        findSessionByTokenHash: async () => ({ userId: USER.id, expiresAt: new Date(now) }),
        findUserById:           async () => USER,
      });
      expect(r).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when the cookie value is the empty string', async () => {
    // A malformed/cleared session cookie (e.g. `${SESSION_COOKIE_NAME}=`) must not
    // round-trip into a session lookup with an empty token — that would let
    // anyone with an empty cookie value probe for a token-hash collision.
    const r = await resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=`), {
      findSessionByTokenHash: async () => { throw new Error('should not be called'); },
      findUserById:           async () => { throw new Error('should not be called'); },
    });
    expect(r).toBeNull();
  });

  it('propagates repo errors instead of swallowing them as "no session"', async () => {
    // A DB outage in findSessionByTokenHash must NOT silently auth-as-anonymous —
    // that would mask infrastructure failures behind a 401, making them
    // indistinguishable from genuine logged-out traffic. Bubble it up so
    // handleRequest's catch ships a proper 500 + Sentry capture.
    await expect(
      resolveCurrentUser(reqWith(`${SESSION_COOKIE_NAME}=anything`), {
        findSessionByTokenHash: async () => { throw new Error('db connection lost'); },
        findUserById:           async () => USER,
      }),
    ).rejects.toThrow('db connection lost');
  });
});
