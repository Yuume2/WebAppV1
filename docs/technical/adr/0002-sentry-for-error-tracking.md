# ADR 0002 — Sentry for error tracking (API + web)

- **Status:** Accepted — integration deferred to wave 1 of the tooling roadmap
- **Date:** 2026-04-23
- **Deciders:** X (tech lead)

## Context

`apps/api` handles auth, encrypted provider secrets, and proxies calls to three
upstream LLMs. A silent server error in this path is expensive: a user could lose
a message, see a cryptic 500, or hit an unreported provider rate limit.

`apps/web` (Next.js 15 App Router, React 19) has no runtime error reporting.
Today a client-side exception is invisible unless the user screenshots the console.

## Decision

Adopt Sentry for both apps.

- **API** — `@sentry/node`, init at server bootstrap (`apps/api/src/index.ts`),
  capture from the `internal_error` branch of `src/middleware/handle-request.ts`
  (already the single centralized error path).
- **Web** — `@sentry/nextjs`, standard wizard integration.

DSNs are read from `SENTRY_DSN_API` (server) and `NEXT_PUBLIC_SENTRY_DSN`
(client). Both are empty by default — Sentry stays disabled in dev and in any
env that does not set them. Two optional server knobs are available:
`SENTRY_ENVIRONMENT` (defaults to `NODE_ENV`) and `SENTRY_RELEASE`.

Scope for the first integration:

- Unhandled error capture only.
- Error sampling 100%; transaction sampling disabled (`tracesSampleRate: 0`).
  10% prod / 0% elsewhere is the plan for the follow-up performance PR.
- No performance tracing, no session replay, no release health — deferred.

## Consequences

- Additive, non-destructive — zero change to business logic, no new runtime
  dependency for users who leave the DSN empty.
- Two small PRs: one per app. Surfaces are disjoint (L owns api, E owns web).
- Source-maps upload, release tagging, performance and replay are explicit
  follow-ups, not part of wave 1.

## Rejected alternatives

- **Logs-only (Pino/Winston + hosted log service)** — gives lines, not grouped
  errors with stack traces and breadcrumbs; poor fit for a multi-provider proxy.
- **Vercel / Next.js built-in analytics** — covers web only, not the api, and is
  not an error tracker.
