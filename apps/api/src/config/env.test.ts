import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseProviderEncryptionKey, getStartupWarnings } from './env.js';

describe('parseProviderEncryptionKey', () => {
  const validHex = randomBytes(32).toString('hex');

  it('returns undefined when both key and databaseUrl are absent (memory mode)', () => {
    expect(parseProviderEncryptionKey(undefined, undefined)).toBeUndefined();
  });

  it('throws when DATABASE_URL is set but PROVIDER_ENCRYPTION_KEY is absent', () => {
    expect(() => parseProviderEncryptionKey(undefined, 'postgres://localhost/mydb'))
      .toThrow('PROVIDER_ENCRYPTION_KEY is required when DATABASE_URL is set');
  });

  it('throws when key is set but too short', () => {
    expect(() => parseProviderEncryptionKey('deadbeef', undefined))
      .toThrow('PROVIDER_ENCRYPTION_KEY must be a 64-character hex string');
  });

  it('throws when key is set but contains non-hex characters', () => {
    const badKey = 'z'.repeat(64);
    expect(() => parseProviderEncryptionKey(badKey, undefined))
      .toThrow('PROVIDER_ENCRYPTION_KEY must be a 64-character hex string');
  });

  it('returns a 32-byte Buffer for a valid key without databaseUrl', () => {
    const buf = parseProviderEncryptionKey(validHex, undefined);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf?.length).toBe(32);
  });

  it('returns a 32-byte Buffer for a valid key with databaseUrl present', () => {
    const buf = parseProviderEncryptionKey(validHex, 'postgres://localhost/mydb');
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf?.length).toBe(32);
  });

  it('error message never contains the raw key value', () => {
    const badKey = 'x'.repeat(64);
    let caught: Error | undefined;
    try { parseProviderEncryptionKey(badKey, undefined); } catch (e) { caught = e as Error; }
    expect(caught).toBeDefined();
    expect(caught?.message).not.toContain(badKey);
  });
});

describe('getStartupWarnings', () => {
  it('returns no warnings when DB is absent', () => {
    expect(getStartupWarnings({ databaseUrl: undefined, corsOrigin: '*' })).toHaveLength(0);
  });

  it('returns no warnings when DB is set and CORS_ORIGIN is explicit', () => {
    expect(getStartupWarnings({ databaseUrl: 'postgres://localhost/db', corsOrigin: 'http://localhost:3000' })).toHaveLength(0);
  });

  it('returns a warning when DATABASE_URL is set and CORS_ORIGIN is "*"', () => {
    const warnings = getStartupWarnings({ databaseUrl: 'postgres://localhost/db', corsOrigin: '*' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('CORS_ORIGIN');
    expect(warnings[0]).toContain('cookie');
  });
});
