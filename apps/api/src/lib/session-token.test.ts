import { describe, it, expect } from 'vitest';
import { generateSessionToken, hashSessionToken, sessionExpiresAt } from './session-token.js';
import { SESSION_EXPIRY_MS } from '../config/auth.js';

describe('session token helpers', () => {
  it('generates a 64-char lowercase hex token', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it('hashes a token deterministically', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('hash is distinct from the raw token', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it('hashes "abc" to the standard SHA-256 vector (algorithm-stability pin)', () => {
    // Pin the algorithm choice with a published RFC 6234 / FIPS 180-4 test
    // vector. A refactor that swapped to BLAKE2 / SHA-3 / a different digest
    // length would break the cookie ↔ stored-hash roundtrip silently for
    // every existing session in the DB. This test fails the moment the
    // digest changes.
    expect(hashSessionToken('abc'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hash is exactly 64 hex chars (SHA-256 output length)', () => {
    expect(hashSessionToken('any-input')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('session expiry is roughly SESSION_EXPIRY_MS in the future', () => {
    const before = Date.now();
    const expiresAt = sessionExpiresAt();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_EXPIRY_MS - 50);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + SESSION_EXPIRY_MS + 50);
  });
});
