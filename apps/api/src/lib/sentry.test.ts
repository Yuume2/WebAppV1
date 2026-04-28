import { describe, expect, it } from 'vitest';
import { captureException, flushSentry, isSentryEnabled } from './sentry.js';

describe('lib/sentry — uninitialized (no DSN)', () => {
  it('isSentryEnabled is false in test env (no SENTRY_DSN_API)', () => {
    expect(isSentryEnabled()).toBe(false);
  });

  it('captureException is a no-op when uninitialized — never throws, never blocks', () => {
    expect(() => captureException(new Error('boom'))).not.toThrow();
    expect(() => captureException(new Error('boom'), { provider: 'openai' })).not.toThrow();
    expect(() => captureException('not even an Error')).not.toThrow();
  });

  it('flushSentry resolves immediately when uninitialized', async () => {
    const startedAt = Date.now();
    await flushSentry(2_000);
    expect(Date.now() - startedAt).toBeLessThan(100);
  });
});
