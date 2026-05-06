import * as Sentry from '@sentry/nextjs';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0,
  });
  initialized = true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
