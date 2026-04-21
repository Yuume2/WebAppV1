import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  encryptWithKey,
  decryptWithKey,
  getEncryptionKey,
  encryptApiKey,
  decryptApiKey,
} from './api-key-cipher.js';

vi.mock('../config/env.js', () => ({
  env: { providerEncryptionKeyBuffer: undefined },
}));

import { env } from '../config/env.js';

// ── Pure cipher roundtrips ────────────────────────────────────────────────────

describe('encryptWithKey / decryptWithKey', () => {
  const key = randomBytes(32);

  it('roundtrip: decrypted value equals original', () => {
    const plain = 'sk-test-abcdef1234567890';
    const stored = encryptWithKey(plain, key);
    expect(decryptWithKey(stored, key)).toBe(plain);
  });

  it('produces a different ciphertext on each call (random IV)', () => {
    const plain = 'sk-same-key';
    const a = encryptWithKey(plain, key);
    const b = encryptWithKey(plain, key);
    expect(a).not.toBe(b);
    // but both decrypt correctly
    expect(decryptWithKey(a, key)).toBe(plain);
    expect(decryptWithKey(b, key)).toBe(plain);
  });

  it('stored format contains three colon-separated parts', () => {
    const stored = encryptWithKey('sk-abc', key);
    expect(stored.split(':').length).toBe(3);
  });

  it('does not store the plaintext in the ciphertext string', () => {
    const plain = 'sk-super-secret-key';
    const stored = encryptWithKey(plain, key);
    expect(stored).not.toContain(plain);
  });

  it('throws on tampered auth tag (GCM integrity check)', () => {
    const plain = 'sk-integrity-test';
    const stored = encryptWithKey(plain, key);
    // Flip one bit in the auth-tag hex segment (second part)
    const [iv, tag, ct] = stored.split(':') as [string, string, string];
    const badTag = tag.slice(0, -2) + (tag.endsWith('ff') ? '00' : 'ff');
    const tampered = `${iv}:${badTag}:${ct}`;
    expect(() => decryptWithKey(tampered, key)).toThrow();
  });

  it('throws with wrong key', () => {
    const plain = 'sk-wrong-key-test';
    const stored = encryptWithKey(plain, key);
    const wrongKey = randomBytes(32);
    expect(() => decryptWithKey(stored, wrongKey)).toThrow();
  });

  it('throws on malformed stored string', () => {
    expect(() => decryptWithKey('not-valid-format', key)).toThrow('Invalid encrypted API key format');
    expect(() => decryptWithKey('only:two', key)).toThrow('Invalid encrypted API key format');
  });
});

// ── Env-aware wrappers ────────────────────────────────────────────────────────

describe('getEncryptionKey', () => {
  it('throws when providerEncryptionKeyBuffer is undefined', () => {
    (env as Record<string, unknown>).providerEncryptionKeyBuffer = undefined;
    expect(() => getEncryptionKey()).toThrow('PROVIDER_ENCRYPTION_KEY');
  });

  it('returns the buffer from env when configured', () => {
    const key = randomBytes(32);
    (env as Record<string, unknown>).providerEncryptionKeyBuffer = key;
    const result = getEncryptionKey();
    expect(result).toBe(key);
    expect(result.length).toBe(32);
  });
});

describe('encryptApiKey / decryptApiKey (env-aware)', () => {
  it('roundtrip via env-aware wrappers', () => {
    const key = randomBytes(32);
    (env as Record<string, unknown>).providerEncryptionKeyBuffer = key;
    const plain = 'sk-env-wrapper-test';
    const stored = encryptApiKey(plain);
    expect(decryptApiKey(stored)).toBe(plain);
  });

  it('encryptApiKey throws when key is not configured', () => {
    (env as Record<string, unknown>).providerEncryptionKeyBuffer = undefined;
    expect(() => encryptApiKey('anything')).toThrow('PROVIDER_ENCRYPTION_KEY');
  });
});
