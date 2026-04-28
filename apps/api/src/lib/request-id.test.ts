import { describe, expect, it } from 'vitest';
import { generateRequestId } from './request-id.js';

describe('generateRequestId', () => {
  it('returns a non-empty string', () => {
    const id = generateRequestId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a UUID v4 — the format header consumers and log indexers expect', () => {
    // The exact regex isn't a contract per se, but two log pipelines depend on
    // matching this format; if we ever swap the impl to nanoid/etc, we want a
    // CI fail forcing the discussion.
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('returns a fresh value on every call', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1_000; i++) ids.add(generateRequestId());
    expect(ids.size).toBe(1_000);
  });
});
