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

  it('session expiry is roughly SESSION_EXPIRY_MS in the future', () => {
    const before = Date.now();
    const expiresAt = sessionExpiresAt();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_EXPIRY_MS - 50);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + SESSION_EXPIRY_MS + 50);
  });
});
