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
});
