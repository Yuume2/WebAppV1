export interface RateLimitResult {
  ok: boolean;
  retryAfterSecs: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Sweep stale entries no more often than this — keeps the amortised cost
 *  per `check()` bounded even for high-cardinality key spaces (per-IP). */
const SWEEP_INTERVAL_MS = 60_000;

export class RateLimiter {
  private readonly store = new Map<string, Window>();
  private lastSweepAt = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    this.maybeSweep(now);
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true, retryAfterSecs: 0 };
    }

    if (entry.count >= this.max) {
      return { ok: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) };
    }

    entry.count++;
    return { ok: true, retryAfterSecs: 0 };
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  /** Walks the store and drops entries whose window has fully elapsed.
   *  Bounds memory under high-cardinality keys (e.g. per-IP rate limiting
   *  on a public endpoint) without an external timer. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    for (const [k, w] of this.store) {
      if (now >= w.resetAt) this.store.delete(k);
    }
  }
}
