export interface RateLimitResult {
  ok: boolean;
  retryAfterSecs: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly store = new Map<string, Window>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
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
}
