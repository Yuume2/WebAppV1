import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password helpers', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces unique hashes for the same input (different salts)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toBe(h2);
  });

  it('rejects a malformed stored hash', async () => {
    expect(await verifyPassword('anything', 'no-colon')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('rejects a stored hash with a wrong-length key (would otherwise crash timingSafeEqual)', async () => {
    // KEY_LEN = 64 bytes = 128 hex chars. timingSafeEqual throws on mismatched
    // buffer lengths, which would propagate as a 500 from a route. The impl
    // pre-checks the hex length and returns false instead — pin that behaviour.
    const truncated = 'aa'.repeat(16) + ':' + 'bb'.repeat(32); // 32-byte key
    expect(await verifyPassword('anything', truncated)).toBe(false);
  });

  it('rejects a stored hash with non-hex characters (Buffer.from would silently truncate)', async () => {
    // Buffer.from('zz', 'hex') yields an empty buffer. Pin that the helper
    // catches and returns false rather than mis-comparing.
    const bad = 'zzzz' + ':' + 'bb'.repeat(64);
    expect(await verifyPassword('anything', bad)).toBe(false);
  });

  it('verifies a 1-character password (lower bound — no min enforced at this layer)', async () => {
    // password.ts is the cryptographic layer — input length policy lives in
    // the auth route's schema. Confirm the helper doesn't have its own
    // hidden minimum that could surprise a caller.
    const hash = await hashPassword('x');
    expect(await verifyPassword('x', hash)).toBe(true);
    expect(await verifyPassword('y', hash)).toBe(false);
  });
});
