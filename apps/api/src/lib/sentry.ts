/**
 * Minimal Sentry wrapper for the API.
 *
 * - No-op when `SENTRY_DSN_API` is not set (dev, test, any env without a DSN).
 * - Only error capture; no performance tracing, no release health, no source-maps
 *   upload. See docs/technical/adr/0002-sentry-for-error-tracking.md.
 *
 * The rest of the codebase imports only `captureException` and `flushSentry`
 * from here, so Sentry stays behind a tiny seam that can be swapped or removed
 * without touching call sites.
 */
import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!env.sentryDsn) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment ?? env.nodeEnv,
    release: env.sentryRelease,
    // Errors only — performance tracing is a follow-up, not wave 1.
    tracesSampleRate: 0,
  });

  initialized = true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;

  if (context && Object.keys(context).length > 0) {
    Sentry.captureException(err, { extra: context });
    return;
  }
  Sentry.captureException(err);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Best-effort flush on shutdown — never throw.
  }
}
