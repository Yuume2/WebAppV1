import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('allows up to max requests in the window', () => {
    const rl = new RateLimiter(3, 60_000);
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('a').ok).toBe(true);
    const blocked = rl.check('a');
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSecs).toBeGreaterThan(0);
    expect(blocked.retryAfterSecs).toBeLessThanOrEqual(60);
  });

  it('isolates buckets by key', () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('a').ok).toBe(false);
    expect(rl.check('b').ok).toBe(true);
  });

  it('resets after the window elapses', () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('a').ok).toBe(false);

    vi.advanceTimersByTime(60_000);
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('a').ok).toBe(false);
  });

  it('retryAfterSecs decreases as time passes within the window', () => {
    const rl = new RateLimiter(1, 60_000);
    rl.check('a');
    const first = rl.check('a');
    expect(first.ok).toBe(false);
    expect(first.retryAfterSecs).toBe(60);

    vi.advanceTimersByTime(45_000);
    const later = rl.check('a');
    expect(later.ok).toBe(false);
    expect(later.retryAfterSecs).toBeLessThanOrEqual(15);
    expect(later.retryAfterSecs).toBeGreaterThan(0);
  });

  it('reset() clears the bucket immediately', () => {
    const rl = new RateLimiter(1, 60_000);
    rl.check('a');
    expect(rl.check('a').ok).toBe(false);
    rl.reset('a');
    expect(rl.check('a').ok).toBe(true);
  });
});
