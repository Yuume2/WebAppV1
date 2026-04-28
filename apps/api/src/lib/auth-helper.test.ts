import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { requireUser } from './auth-helper.js';

const fakeReq = {} as unknown as IncomingMessage;

describe('requireUser', () => {
  it('returns ok: true with the resolved user when the resolver yields one', async () => {
    const r = await requireUser(fakeReq, async () => ({ id: 'user-1' }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.user.id).toBe('user-1');
  });

  it('preserves extra user fields beyond id (the helper is generic over the user shape)', async () => {
    const r = await requireUser(fakeReq, async () => ({ id: 'user-1', email: 'a@b.com' }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.user.email).toBe('a@b.com');
  });

  it('returns ok: false with a 401 result when the resolver yields null', async () => {
    const r = await requireUser(fakeReq, async () => null);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.result.httpStatus).toBe(401);
    if (r.result.body.ok) throw new Error('expected error envelope');
    expect(r.result.body.error.code).toBe('unauthenticated');
    expect(r.result.body.error.message).toBe('Not authenticated');
  });

  it('forwards the request object to the resolver verbatim', async () => {
    let received: IncomingMessage | undefined;
    await requireUser(fakeReq, async (req) => { received = req; return null; });
    expect(received).toBe(fakeReq);
  });

  it('lets resolver-thrown errors propagate (no silent auth-as-anonymous masking)', async () => {
    // Same contract as resolveCurrentUser: a DB outage in the resolver must
    // surface as a 5xx via handleRequest's catch, not as a 401 that hides
    // infrastructure failures behind "logged out" traffic.
    await expect(
      requireUser(fakeReq, async () => { throw new Error('db down'); }),
    ).rejects.toThrow('db down');
  });

  it('emits a 401 result with NO headers attached (no Set-Cookie, no Allow leakage)', async () => {
    // The 401 response from requireUser is built via respondError('unauthenticated', ...).
    // It must not carry a headers object — a refactor that decided to attach
    // Set-Cookie or Allow on unauth would leak information (e.g. Allow could
    // tell an unauthenticated probe which methods exist on the route, and a
    // Set-Cookie clear is the responsibility of the explicit logout path).
    const r = await requireUser(fakeReq, async () => null);
    if (r.ok) throw new Error('expected fail');
    expect(r.result.headers).toBeUndefined();
    expect(r.result.streamed).toBeUndefined();
  });

  it('returns a 400-default-overridden 401 status (not the respondError default)', async () => {
    // respondError defaults to 400. The helper passes 401 explicitly. Pin
    // that explicit override so a refactor that drops the 401 argument and
    // accidentally falls back to 400 fails CI.
    const r = await requireUser(fakeReq, async () => null);
    if (r.ok) throw new Error('expected fail');
    expect(r.result.httpStatus).toBe(401);
    expect(r.result.httpStatus).not.toBe(400);
  });
});
